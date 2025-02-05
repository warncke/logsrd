import fs from "node:fs/promises"

import HotLog from "./persist/hot-log"
import Server from "./server"

export default class Persist {
    server: Server
    oldHotLog: HotLog
    newHotLog: HotLog
    emptyOldHotLogInProgress: Promise<void> | null = null
    moveNewToOldHotLogInProgress: Promise<void> | null = null

    constructor(server: Server) {
        this.server = server
        this.oldHotLog = new HotLog(server, false)
        this.newHotLog = new HotLog(server, true)
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
        } else if (entryCounts.newHotLog > this.server.config.globalIndexCountLimit) {
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

        for (const log of this.server.logs.values()) {
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

        for (const log of this.server.logs.values()) {
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

        this.oldHotLog = new HotLog(this.server, false)
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
        const newHotLog = new HotLog(this.server, true)
        // swap newHotLog to oldHotLog
        this.newHotLog.logFile = this.oldHotLog.logFile
        this.newHotLog.isNew = false
        this.oldHotLog = this.newHotLog
        this.newHotLog = newHotLog
        // for all open logs the newHotLogIndex is now the oldHotLogIndex
        for (const log of this.server.logs.values()) {
            log.moveNewToOldHotLog()
        }
        // unblock IO
        await this.oldHotLog.unblockIO()
        // start processing
        this.oldHotLog.processOps()
        this.newHotLog.processOps()
    }
}
