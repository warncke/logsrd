import fs from "node:fs/promises"
import path from "path"

import LogId from "./log-id"
import PersistLog from "./persist/persist-log"
import HotLog from "./persist/persisted-log/hot-log"

export type PersistConfig = {
    dataDir: string
    pageSize: number
    globalIndexCountLimit: number
    globalIndexSizeLimit: number
    hotLogFileName?: string
    blobDir?: string
    logDir?: string
}

const DEFAULT_HOT_LOG_FILE_NAME = "global-hot.log"

export default class Persist {
    config: PersistConfig
    oldHotLog: HotLog
    newHotLog: HotLog
    logs: Map<string, PersistLog>
    emptyOldHotLogInProgress: Promise<void> | null = null
    moveNewToOldHotLogInProgress: Promise<void> | null = null

    constructor(config: PersistConfig) {
        config.hotLogFileName = config.hotLogFileName || DEFAULT_HOT_LOG_FILE_NAME
        config.blobDir = config.blobDir || path.join(config.dataDir, "blobs")
        config.logDir = config.logDir || path.join(config.dataDir, "logs")
        this.config = config
        this.oldHotLog = new HotLog({
            logFile: path.join(this.config.dataDir, `${config.hotLogFileName}.old`),
            persist: this,
            isOldHotLog: true,
        })
        this.newHotLog = new HotLog({
            logFile: path.join(this.config.dataDir, `${config.hotLogFileName}.new`),
            persist: this,
            isNewHotLog: true,
        })
        this.logs = new Map()
    }

    deleteLog(logId: LogId) {
        this.logs.delete(logId.base64())
    }

    getLog(logId: LogId): PersistLog {
        if (!this.logs.has(logId.base64())) {
            this.logs.set(logId.base64(), new PersistLog(this, logId))
        }
        return this.logs.get(logId.base64())!
    }

    async init(): Promise<void> {
        await this.oldHotLog.init()
        await this.newHotLog.init()
        // run monitor immediately
        this.monitor()
        // run monitor every 10 seconds
        setInterval(() => this.monitor(), 10000)
    }

    monitor() {
        if (this.emptyOldHotLogInProgress !== null) {
            return
        }
        if (this.moveNewToOldHotLogInProgress !== null) {
            return
        }
        const entryCounts = this.globalIndexEntryCounts()
        if (entryCounts.oldHotLog > 0) {
            this.emptyOldHotLogInProgress = this.emptyOldHotLog()
                .catch((err) => console.error("emptyOldHotLog error", err))
                .then(() => {
                    this.emptyOldHotLogInProgress = null
                })
        } else if (entryCounts.newHotLog > this.config.globalIndexCountLimit) {
            this.moveNewToOldHotLogInProgress = this.moveNewToOldHotLog()
                .catch((err) => console.error("moveNewToOldHotLog error", err))
                .then(() => {
                    this.moveNewToOldHotLogInProgress = null
                })
        }
    }

    globalIndexEntryCounts() {
        const entryCounts = {
            newHotLog: 0,
            oldHotLog: 0,
        }

        for (const log of this.logs.values()) {
            entryCounts.newHotLog += log.newHotLogEntryCount()
            entryCounts.oldHotLog += log.oldHotLogEntryCount()
        }

        return entryCounts
    }
    async emptyOldHotLog(): Promise<void> {
        try {
            await fs.stat(this.oldHotLog.logFile)
        } catch {
            throw new Error("old hot log should exist")
        }

        for (const log of this.logs.values()) {
            await log.emptyOldHotLog()
        }

        await this.oldHotLog.blockIO()
        await this.oldHotLog.closeAllFHs()
        // there should not be any pending ops now but fail them if there are
        while (this.oldHotLog.ioQueue.opPending()) {
            console.error("emptyOldHotLog completed with pending ops")
            const [reads, writes] = this.oldHotLog.ioQueue.getReady()
            if (writes.length > 0) {
                console.error("oldHotLog had writes", writes)
            }
            for (const op of reads) {
                op.completeWithError(new Error("read after empty on old hot log"))
            }
            for (const op of writes) {
                op.completeWithError(new Error("write on old hot log"))
            }
        }

        await fs.unlink(this.oldHotLog.logFile)

        this.oldHotLog = new HotLog({
            logFile: this.oldHotLog.logFile,
            persist: this,
            isOldHotLog: true,
        })
    }

    async moveNewToOldHotLog(): Promise<void> {
        let stat = null
        try {
            stat = await fs.stat(this.oldHotLog.logFile)
        } catch (_err) {
            // file should not exist
        }
        if (stat !== null) {
            throw new Error("old hot log should not exist")
        }
        // block IO and wait till ioInProgress completes
        await this.newHotLog.blockIO()
        await this.newHotLog.closeAllFHs()
        // move new to old hot log file
        await fs.rename(this.newHotLog.logFile, this.oldHotLog.logFile)
        const newHotLog = new HotLog({
            logFile: this.newHotLog.logFile,
            persist: this,
            isNewHotLog: true,
        })
        // swap newHotLog to oldHotLog
        this.newHotLog.logFile = this.oldHotLog.logFile
        this.newHotLog.isNewHotLog = false
        this.newHotLog.isOldHotLog = true
        this.oldHotLog = this.newHotLog
        this.newHotLog = newHotLog
        // for all open logs the newHotLogIndex is now the oldHotLogIndex
        for (const log of this.logs.values()) {
            log.moveNewToOldHotLog()
        }
        // unblock IO
        await this.oldHotLog.unblockIO()
        // start processing
        this.oldHotLog.processOps()
        this.newHotLog.processOps()
    }
}
