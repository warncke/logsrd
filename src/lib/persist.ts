import fs from 'node:fs/promises'
import path from 'path';

import ColdLog from './cold-log';
import HotLog from './hot-log';
import LogConfig from './log-config';
import LogId from './log-id';
import PersistLog from './persist-log';

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
 * | Length Byte | Length Byte? | Log Entry Data | Length Byte? | Length Byte |
 * 
 * Length is encoded using variable length integer encoding of a big endian unsigned integer.
 * If the first bit is 1 then it is a 2-byte number, with the remaining 15 bits being the
 * number. If the first bit is 0 then it is a 1-byte number with the remaining 7 bits being
 * the number.
 * 
 * The maximum length for a log entry is 32,765, while the maximum length with a single-byte
 * length is 127.
 * 
 * Log entries larger than 32,765 bytes are stored as pageSize aligned blobs and then the entry
 * is written to the log as the blobId + any remaining data that does not fill a page.
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
    pageSize: number,
    diskCompactThreshold: number,
    memCompactThreshold: number,
    coldLogFileName?: string,
    hotLogFileName?: string,
}

const DEFAULT_COLD_LOG_FILE_NAME = 'global-cold.log'
const DEFAULT_HOT_LOG_FILE_NAME = 'global-hot.log'

export default class Persist {
    config: PersistConfig
    coldLog: ColdLog
    hotLog: HotLog

    constructor(config: PersistConfig) {
        config.coldLogFileName = config.coldLogFileName || DEFAULT_COLD_LOG_FILE_NAME
        config.hotLogFileName = config.hotLogFileName || DEFAULT_HOT_LOG_FILE_NAME
        this.config = config
        this.coldLog = new ColdLog({
            logFile: path.join(this.config.dataDir, config.coldLogFileName),
        })
        this.hotLog = new HotLog({
            logFile: path.join(this.config.dataDir, config.hotLogFileName),
        })
    }

    async init(): Promise<void> {
        await Promise.all([
            this.hotLog.init(),
            this.coldLog.init(),
        ])
    }

    async createLog({ config }: { config: LogConfig }): Promise<PersistLog> {
        const pLog = new PersistLog({ config, logId: config.logId, persist: this })
        await pLog.create()
        return pLog
    }

    async openLog({ logId }: { logId: LogId }): Promise<PersistLog|null> {
        const pLog = new PersistLog({ logId, persist: this })
        await pLog.init()
        return pLog
    }

}
