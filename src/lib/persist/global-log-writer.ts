import fs from "node:fs/promises"

import GlobalLogEntry from "../entry/global-log-entry"
import GlobalLog from "./global-log"
import WriteQueue from "./write-queue"

export default class GlobalLogWriter {
    static async write(log: GlobalLog): Promise<void> {
        if (log.writeInProgress) {
            return
        }
        if (log.writeQueue === null) {
            log.writeQueue = new WriteQueue()
            return
        }
        if (log.writeQueue.queue.length === 0) {
            return
        }

        const writeQueue = (log.writeInProgress = log.writeQueue!)
        log.writeQueue = new WriteQueue()

        try {
            if (log.fh === null) {
                log.fh = await fs.open(log.logFile, "a")
            }
            // create index of offset and length of every write which will
            // be added to the hot/cold log index if all writes are successful
            const logs: Map<string, Array<number>> = new Map()
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // get total length of this write
            let totalBytes = 0
            // add all items from queue to list of u8s to write
            for (const item of writeQueue.queue) {
                // create global log entry
                const globalLogEntry = new GlobalLogEntry({
                    logId: item.logId,
                    entry: item.entry,
                })
                totalBytes += globalLogEntry.byteLength()
                u8s.push(...globalLogEntry.u8s())
            }
            // write buffers
            const ret = await log.fh.writev(u8s)
            // sync data only as we do not care about metadata
            await log.fh.datasync()

            if (ret.bytesWritten !== totalBytes) {
                throw new Error(
                    `Failed to write all bytes. Expected: ${totalBytes} Actual: ${ret.bytesWritten}`,
                )
            }

            for (const [logId, offsets] of logs) {
                if (log.index.has(logId)) {
                    log.index.get(logId)!.push(...offsets)
                } else {
                    log.index.set(logId, offsets)
                }
            }

            if (writeQueue.resolve !== null) {
                writeQueue.resolve()
            }
        } catch (err) {
            // submitters waiting on write queue must be notified of error
            // this will cause their requests to error out. we do not
            // reattempt the same queue and truncate any partial write
            if (writeQueue.reject !== null) writeQueue.reject(err)
            // rethrow error to notify caller
            throw err
        }
        // set this queue to null because it has been written now. if an
        // error occurred this queue will stay in progress until it is
        // cleaned up preventing any further writes until the log is
        // trucated if a partial write occurred.
        log.writeInProgress = null
        // if new write queue has any items then process it on next tick
        if (log.writeQueue !== null && log.writeQueue.queue.length > 0) {
            setTimeout(() => GlobalLogWriter.write(log), 0)
        }
    }
}
