import fs from "node:fs/promises"

import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry from "../entry/global-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL } from "../globals"
import GlobalLog from "./global-log"
import LogIndex from "./log-index"
import WriteQueue from "./write-queue"

export default class GlobalLogWriter {
    static async processWriteQueue(log: GlobalLog): Promise<void> {
        if (log.writeBlocked || log.writeInProgress) {
            return
        }
        if (log.writeQueue === null) {
            log.writeQueue = new WriteQueue()
            return
        }
        if (log.writeQueue.queue.length === 0) {
            return
        }

        log.writeInProgress = log.writeQueue!
        log.writeQueue = new WriteQueue()

        try {
            // create index of offset and length of every write which will
            // be added to the hot/cold log index if all writes are successful
            const index: Map<string, LogIndex> = new Map()
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // keep track of the number of bytes expected to be written
            let writeBytes = 0
            // starts with a positive number that is the number of bytes since the last checkpoint
            let checkpointOffset =
                log.byteLength > GLOBAL_LOG_CHECKPOINT_INTERVAL
                    ? log.byteLength % GLOBAL_LOG_CHECKPOINT_INTERVAL
                    : log.byteLength
            // add all items from queue to list of u8s to write
            for (const item of log.writeInProgress.queue) {
                // create global log entry
                const globalLogEntry = new GlobalLogEntry({
                    logId: item.logId,
                    entry: item.entry,
                })
                // create/get log index for this logId
                if (!index.has(item.logId.base64())) {
                    index.set(item.logId.base64(), new LogIndex())
                }
                const logIndex = index.get(item.logId.base64())!
                // offset of entry from length of file + bytes written in current write
                const entryOffset = log.byteLength + writeBytes
                // and entry to local index which will be merged to global index after write completes
                // ofset and length are of global entry but we pass in the log entry because it needs
                // to be type checked to determine exactly what needs to be indexed
                logIndex.addEntry(item.entry, entryOffset, globalLogEntry.byteLength())
                // bytes since last checkpoint including this entry
                const bytesSinceCheckpoint = checkpointOffset + writeBytes + globalLogEntry.byteLength()
                // if this entry would cross or end at checkpoint boundardy then add checkpoint
                if (bytesSinceCheckpoint >= GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset = bytesSinceCheckpoint - GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // create checkpoint entry
                    const checkpointEntry = new GlobalLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: globalLogEntry.byteLength(),
                    })
                    // offset becomes negative because now we need an additional GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // bytes before the next offset
                    checkpointOffset = -(writeBytes + lastEntryOffset)
                    // if entry ends directly at checkpoint then add before
                    if (lastEntryOffset === globalLogEntry.byteLength()) {
                        // add log entry
                        u8s.push(...globalLogEntry.u8s())
                        writeBytes += globalLogEntry.byteLength()
                        // add checkpoint entry
                        u8s.push(...checkpointEntry.u8s())
                        writeBytes += checkpointEntry.byteLength()
                    }
                    // otherwise split entry and add before/after checkpoint
                    else {
                        // use Buffer here because this will never run in browser
                        const entryBuffer = Buffer.concat(globalLogEntry.u8s(), globalLogEntry.byteLength())
                        // add beginning segment of entry before checkpoint
                        u8s.push(entryBuffer.slice(0, lastEntryOffset))
                        writeBytes += lastEntryOffset
                        // add checkpoint entry
                        u8s.push(...checkpointEntry.u8s())
                        writeBytes += checkpointEntry.byteLength()
                        // add end segment of entry after checkpoint
                        u8s.push(entryBuffer.slice(lastEntryOffset))
                        writeBytes += entryBuffer.byteLength - lastEntryOffset
                    }
                }
                // otherwise add entry
                else {
                    u8s.push(...globalLogEntry.u8s())
                    writeBytes += globalLogEntry.byteLength()
                }
            }

            await GlobalLogWriter._writeU8sUnsafe(log, u8s, writeBytes)

            for (const [logId, logIndex] of index) {
                if (log.index.has(logId)) {
                    log.index.get(logId)!.appendIndex(logIndex)
                } else {
                    log.index.set(logId, logIndex)
                }
            }

            if (log.writeInProgress.resolve !== null) {
                log.writeInProgress.resolve()
            }
        } catch (err) {
            // submitters waiting on write queue must be notified of error
            // this will cause their requests to error out. we do not
            // reattempt the same queue and truncate any partial write
            if (log.writeInProgress.reject !== null) log.writeInProgress.reject(err)
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
            setTimeout(GlobalLogWriter.processWriteQueue, 0, log)
        }
    }

    /**
     * Write array of u8s to log writeFH.
     */
    static async writeU8sBlocking(log: GlobalLog, u8s: Uint8Array[]): Promise<void> {
        const promise = new Promise<void>((resolve, reject) => {
            GlobalLogWriter._writeU8sBlocking(log, u8s).then(resolve).catch(reject)
        })
        await log.blockWrite(promise)
        await promise
    }

    static async _writeU8sBlocking(log: GlobalLog, u8s: Uint8Array[]): Promise<void> {}

    /**
     * Do write actual write without any checks for blocking
     */
    static async _writeU8sUnsafe(log: GlobalLog, u8s: Uint8Array[], writeBytes: number): Promise<void> {
        // write buffers
        const ret = await (await log.getWriteFH()).writev(u8s)
        if (ret.bytesWritten === writeBytes) {
            // sync data only as we do not care about metadata
            await (await log.getWriteFH()).datasync()
            // update internal file length
            log.byteLength += ret.bytesWritten
        } else {
            try {
                await log.truncate(log.byteLength)
            } catch (err) {
                log.byteLength += ret.bytesWritten
                throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
            }
        }
    }
}
