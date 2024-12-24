import fs from "node:fs/promises"
import path from "path"

import LogId from "./log-id"
import PersistLog from "./persist/persist-log"
import ColdLog from "./persist/persisted-log/cold-log"
import HotLog from "./persist/persisted-log/hot-log"

/**
 * Persistence
 *
 * Persistence of data all takes place to dataDir.
 *
 * dataDir
 *     - global-hot.log
 *     - global-cold.log
 *     - logs
 *         - 00
 *             - 00
 *             - ..
 *             - ff
 *         - ..
 *         - ff
 *     - blobs
 *         - 00
 *             - 00
 *             - ..
 *             - ff
 *         - ..
 *         - ff
 *
 * Individual blobs and logs are stored in a tree folder structure with 65,536 folders structured
 * as 00-FF with each blob or log being placed in the correct folder based on the first 2 bytes
 * of the logId.
 *
 * Writes to individual log files are aligned to pageSize which is configurable and
 * should be based on the pageSize of the SSD device used to store the log. Typical
 * values would be 4KB-16KB. 16KB is the maximum pageSize.
 *
 * Blobs are always a mutiple of pageSize.
 *
 * If a createLog or appendLog operation generates a new entry that does not align with
 * pageSize the entry will be written to `global-hot.log`.
 *
 * The initial createLog operation will typically be written to `global-hot.log` and the
 * individual log file will not be created and written to until enough data has been
 * appended to fill an entire page.
 *
 * On each appendLog opperation the amount of appended data will be checked and if it
 * is greater than or equal to pageSize the data will be written to the log file. The
 * individual log file may contain a partial entry in which case the last entry will
 * still need to be read from a global log.
 *
 * Using global logs creates both disk and memory usage pressure.
 *
 * In the typical case where most log entries are written to `global-hot.log` first
 * this log will grow very fast and as data is copied from it to individual log files
 * the storage space used will be double the size of the underlying logs.
 *
 * The total size of the global log files will also impact initialization time because
 * these files need to be read in their entirety on startup, before handling any requests,
 * in order to build an index of the logs and log entries that are still pending writes to
 * individual logs.
 *
 * The `diskCompactThreshold` and `memCompactThreshold` configuration options control the compaction
 * of the global logs.
 *
 * When `diskCompactThreshold` is reached the `global-hot.log` will be compacted. All entries
 * that have already been appended to individual logs files are dropped. If an individual
 * log recieved enough data to fill an entire page since the last compaction, but it still
 * has a partially compacted final entry, then this will be kept in `global-hot.log`. Any
 * entries for logs that did not recieve enough data to fill an entire page will be appended
 * to `global-cold.log`.
 *
 * After running a compaction of the `global-hot.log`, if `memCompactThreshold` has been exceeded,
 * which will be due to having too many logs with pending writes in `global-hot.log` and
 * `global-cold.log` combined, then entries from `global-cold.log` will be flushed to
 * individual log files even if they do not fill an entire page. This will be done starting
 * with logs that have recieved the least recent entries and continue till the memory used
 * for pending log writes is half of `memCompactThreshold`.
 *
 * LogEntries are written to logs framed by bytes indicating entry length at the beginning and
 * end of the entry data.
 *
 * | Length (2) Bytes | Log Entry Data | Length (2) Bytes |
 *
 * Length is encoded using a little endian unsigned 16bit integer. The maximum value for length
 * is 65,535.
 *
 * Log entries are currently limited to 32KB (32,768 bytes). Storage for larger log entries in an
 * off-log blob store is planned.
 *
 * The first entry in every log is the CREATE_LOG entry which contains the initial configuration.
 *
 * Logs are self defining so every modification to the configuration will be persisted as an
 * entry to the log.
 *
 * Every checkPointInteval bytes (length % checkPointInterval) a checkpoint entry is written to the
 * log that contains metadata needed to establish the current state of the log such as the total
 * number of entries and the position of the last configuration update.
 *
 * The log entries stored in the global hot and cold logs are exactly the same as the entries stored
 * in the individual log files except that every entry is prefixed with the 16 byte logId that the
 * entry belongs to.
 *
 * Because the index for the global logs is always kept in memory it does not include checkpoints.
 *
 */

export type PersistConfig = {
    dataDir: string
    pageSize: number
    globalIndexCountLimit: number
    globalIndexSizeLimit: number
    coldLogFileName?: string
    hotLogFileName?: string
    blobDir?: string
    logDir?: string
}

const DEFAULT_COLD_LOG_FILE_NAME = "global-cold.log"
const DEFAULT_HOT_LOG_FILE_NAME = "global-hot.log"

export default class Persist {
    config: PersistConfig
    coldLog: ColdLog
    oldHotLog: HotLog
    newHotLog: HotLog
    logs: Map<string, PersistLog>
    emptyOldHotLogInProgress: Promise<void> | null = null
    moveNewToOldHotLogInProgress: Promise<void> | null = null

    constructor(config: PersistConfig) {
        config.coldLogFileName = config.coldLogFileName || DEFAULT_COLD_LOG_FILE_NAME
        config.hotLogFileName = config.hotLogFileName || DEFAULT_HOT_LOG_FILE_NAME
        config.blobDir = config.blobDir || path.join(config.dataDir, "blobs")
        config.logDir = config.logDir || path.join(config.dataDir, "logs")
        this.config = config
        this.coldLog = new ColdLog({
            logFile: path.join(this.config.dataDir, config.coldLogFileName),
            persist: this,
            isColdLog: true,
        })
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

    getLog(logId: LogId): PersistLog {
        if (!this.logs.has(logId.base64())) {
            this.logs.set(logId.base64(), new PersistLog(this, logId))
        }
        return this.logs.get(logId.base64())!
    }

    async init(): Promise<void> {
        // iniitalize logs in inverse order of how they are written to
        await this.coldLog.init()
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
        console.log(entryCounts)
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
            coldLog: 0,
        }

        for (const log of this.logs.values()) {
            entryCounts.newHotLog += log.newHotLogEntryCount()
            entryCounts.oldHotLog += log.oldHotLogEntryCount()
            entryCounts.coldLog += log.coldLogEntryCount()
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

        // after each log finishes emptyOldHotLog it should not send any more reads to the old hot log
        // because old hot log only processes reads anything pending should have been processed in the
        // last batch that blockIO waits to finish
        if (this.oldHotLog.ioQueue.opPending()) {
            console.error("emptyOldHotLog completed with pending ops", this.oldHotLog.ioQueue)
            const [reads, writes] = this.oldHotLog.ioQueue.getReady()
            // this should never happen
            if (writes.length > 0) {
                console.error("oldHotLog had writes", writes)
            }
            // just fail them for now
            for (const op of reads) {
                op.completeWithError(new Error("read after empty on old hot log"))
            }
            for (const op of writes) {
                op.completeWithError(new Error("write on old hot log"))
            }
        }

        await fs.unlink(this.oldHotLog.logFile)
        // create a new HotLog object to clear old state
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
