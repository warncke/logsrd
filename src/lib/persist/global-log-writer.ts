import fs from "node:fs/promises"

import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry, { PREFIX_BYTE_LENGTH } from "../entry/global-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL, LogIndex } from "../globals"
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

        log.writeInProgress = log.writeQueue!
        log.writeQueue = new WriteQueue()

        try {
            if (log.fh === null) {
                log.fh = await fs.open(log.logFile, "a")
            }
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
                // create/get log index for this logId
                if (!index.has(item.logId.base64())) {
                    index.set(item.logId.base64(), {
                        en: [],
                        cm: [],
                        lc: [],
                    })
                }
                const logIndex = index.get(item.logId.base64())!
                // offset of entry is after the global log entry prefix
                const entryOffset = log.byteLength + writeBytes + PREFIX_BYTE_LENGTH
                // create log and set config both store the current log config we only need most recent
                if (item.entry instanceof CreateLogCommand || item.entry instanceof SetConfigCommand) {
                    logIndex.lc[0] = entryOffset
                    logIndex.lc[1] = item.entry.byteLength()
                } else if (item.entry instanceof CommandLogEntry) {
                    logIndex.cm.push(entryOffset, item.entry.byteLength())
                } else {
                    logIndex.en.push(entryOffset, item.entry.byteLength())
                }
                // create global log entry
                const globalLogEntry = new GlobalLogEntry({
                    logId: item.logId,
                    entry: item.entry,
                })
                // if this write would cross a checkpoint boundary then split it and add a checkpoint at the boundary
                if (checkpointOffset + writeBytes + globalLogEntry.byteLength() > GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                    // use Buffer here because this will never run in browser
                    const entryBuffer = Buffer.concat(globalLogEntry.u8s(), globalLogEntry.byteLength())
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset =
                        checkpointOffset + writeBytes + globalLogEntry.byteLength() - GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // add beginning segment of entry before checkpoint
                    u8s.push(entryBuffer.slice(0, lastEntryOffset))
                    writeBytes += lastEntryOffset
                    // offset becomes negative because now we need an additional GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // bytes before the next offset
                    checkpointOffset = -writeBytes
                    // create checkpoint entry
                    const checkpointEntry = new GlobalLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: entryBuffer.byteLength,
                    })
                    u8s.push(...checkpointEntry.u8s())
                    writeBytes += checkpointEntry.byteLength()
                    // add end segment of entry after checkpoint
                    u8s.push(entryBuffer.slice(lastEntryOffset))
                    writeBytes += entryBuffer.byteLength - lastEntryOffset
                }
                // otherwise add entry
                else {
                    writeBytes += globalLogEntry.byteLength()
                    u8s.push(...globalLogEntry.u8s())
                }
            }
            // write buffers
            const ret = await log.fh.writev(u8s)
            // sync data only as we do not care about metadata
            await log.fh.datasync()

            if (ret.bytesWritten !== writeBytes) {
                throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
            }

            for (const [logId, logIndex] of index) {
                if (log.index.has(logId)) {
                    const globalLogIndex = log.index.get(logId)!
                    globalLogIndex.en.push(...logIndex.en)
                    globalLogIndex.cm.push(...logIndex.cm)
                    if (logIndex.lc.length > 0) {
                        globalLogIndex.lc[0] = logIndex.lc[0]
                        globalLogIndex.lc[1] = logIndex.lc[1]
                    }
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
            setTimeout(() => GlobalLogWriter.write(log), 0)
        }
    }
}
