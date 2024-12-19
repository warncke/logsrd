import path from "path"

import LogConfig from "./log-config"
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
    diskCompactThreshold: number
    memCompactThreshold: number
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

    constructor(config: PersistConfig) {
        config.coldLogFileName = config.coldLogFileName || DEFAULT_COLD_LOG_FILE_NAME
        config.hotLogFileName = config.hotLogFileName || DEFAULT_HOT_LOG_FILE_NAME
        config.blobDir = config.blobDir || path.join(config.dataDir, "blobs")
        config.logDir = config.logDir || path.join(config.dataDir, "logs")
        this.config = config
        // TODO: this is hacky but i want to be able to control log reading based on log
        // config and i dont want to make these params optional and then have to add checks
        // everywhere to statisfy tsc so i am doing it like this for now
        const globalLogConfig = new LogConfig({
            logId: new LogId(new Uint8Array(16)),
            master: "",
            type: "global",
        })
        this.coldLog = new ColdLog({
            config: globalLogConfig,
            logFile: path.join(this.config.dataDir, config.coldLogFileName),
            persist: this,
            isColdLog: true,
        })
        this.oldHotLog = new HotLog({
            config: globalLogConfig,
            logFile: path.join(this.config.dataDir, `${config.hotLogFileName}.old`),
            persist: this,
            isOldHotLog: true,
        })
        this.newHotLog = new HotLog({
            config: globalLogConfig,
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
    }
}
