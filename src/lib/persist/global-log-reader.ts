import fs, { FileHandle } from "node:fs/promises"

import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry from "../entry/global-log-entry"
import LogLogEntry from "../entry/log-log-entry"
import GlobalLogEntryFactory from "../global-log-entry-factory"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL, ReadQueueItem } from "../globals"
import LogId from "../log-id"
import GlobalLog from "./global-log"
import LogIndex from "./log-index"
import ReadQueue from "./read-queue"

export default class GlobalLogReader {
    static async initGlobal(log: GlobalLog): Promise<void> {
        // this should only be run at startup so these should always be null
        if (log.writeFH !== null || log.readBlocked !== null || log.writeBlocked !== null) {
            throw new Error("Error starting initGlobal")
        }
        // create promise to block reads/writes on log while this runs
        // this should not really be necessary
        const promise = new Promise<void>((resolve, reject) => {
            GlobalLogReader._initGlobal(log)
                .then(() => {
                    // clear blockers when done
                    log.unblockRead()
                    log.unblockWrite()
                    resolve()
                })
                .catch(reject)
        })
        log.readBlocked = promise
        log.writeBlocked = promise

        return promise
    }

    static async _initGlobal(log: GlobalLog): Promise<void> {
        let fh: FileHandle | null = null
        try {
            fh = await fs.open(log.logFile, "r")
            await GlobalLogReader.__initGlobal(log, fh)
        } catch (err: any) {
            // ignore if file does not exist - it will be created on open for write
            if (err.code !== "ENOENT") {
                throw err
            }
        } finally {
            if (fh !== null) {
                await fh.close()
            }
        }
    }

    static async __initGlobal(log: GlobalLog, fh: FileHandle): Promise<void> {
        let lastU8: Uint8Array | null = null
        let currU8 = new Uint8Array(GLOBAL_LOG_CHECKPOINT_INTERVAL)
        // bytes read from file
        let bytesRead = 0

        while (true) {
            const ret = await fh.read(currU8, { length: GLOBAL_LOG_CHECKPOINT_INTERVAL })
            // bytes read from current buffer
            let u8BytesRead = 0
            // reads are aligned to checkpoint interval so every read after the first must start with checkpoint
            if (bytesRead > GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                const checkpoint = GlobalLogCheckpoint.fromU8(currU8) as GlobalLogCheckpoint
                u8BytesRead += checkpoint.byteLength()
                const lastEntryLength = checkpoint.lastEntryLengthValue()
                const lastEntryOffset = checkpoint.lastEntryOffsetValue()
                // if the last entry did not end on checkpoint boundary then need to combine from last and curr
                if (lastEntryOffset !== lastEntryLength) {
                    const lastEntryU8 = Buffer.concat([
                        new Uint8Array(lastU8!.buffer, lastU8!.byteLength - lastEntryLength),
                        new Uint8Array(currU8.buffer, 0, lastEntryOffset),
                    ])
                    const res = GlobalLogEntryFactory.fromPartialU8(lastEntryU8)
                    if (res.err) {
                        throw res.err
                    } else if (res.needBytes) {
                        throw new Error("Error getting entry from checkpoint boundary")
                    }
                    const entry = res.entry
                    const entryOffset = bytesRead - lastEntryOffset
                    // handle command log entries
                    if (entry instanceof LogLogEntry) {
                        console.log(entry, entry.byteLength())
                    }
                    // otherwise this is log entry
                    else {
                        GlobalLogReader.addEntryToLog(log, entry as GlobalLogEntry, entryOffset)
                    }
                    u8BytesRead += entry!.byteLength()
                }
            }

            while (u8BytesRead < ret.bytesRead) {
                const res = GlobalLogEntryFactory.fromPartialU8(
                    new Uint8Array(currU8.buffer, currU8.byteOffset + u8BytesRead, currU8.byteLength - u8BytesRead),
                )
                if (res.err) {
                    throw res.err
                } else if (res.needBytes) {
                    // swap last and curr buffers - on next iteration new data is read into old last and last is the old curr
                    ;[lastU8] = [currU8]
                    break
                }
                const entry = res.entry
                const entryOffset = bytesRead + u8BytesRead
                // handle command log entries
                if (entry instanceof LogLogEntry) {
                    console.log(entry, entry.byteLength())
                }
                // otherwise this is log entry
                else {
                    GlobalLogReader.addEntryToLog(log, entry as GlobalLogEntry, entryOffset)
                }
                u8BytesRead += entry!.byteLength()
            }

            bytesRead += ret.bytesRead
            // if we did not read requested bytes then end of file reached
            if (ret.bytesRead < GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                break
            }
        }

        console.log(log.index)

        log.byteLength = bytesRead
    }

    static addEntryToLog(log: GlobalLog, entry: GlobalLogEntry, entryOffset: number): void {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed", entry)
        }
        // create/get log index for this logId
        if (!log.index.has(entry.logId.base64())) {
            log.index.set(entry.logId.base64(), new LogIndex())
        }
        const logIndex = log.index.get(entry.logId.base64())!
        // ofset and length are of global entry but we pass in the log entry because it needs
        // to be type checked to determine exactly what needs to be indexed
        logIndex.addEntry(entry.entry, entryOffset, entry.byteLength())
    }

    static processReadQueue(log: GlobalLog): void {
        if (log.readBlocked || log.readInProgress) {
            return
        }
        if (log.readQueue === null) {
            log.readQueue = new ReadQueue()
            return
        }
        if (log.readQueue.queue.length === 0) {
            return
        }

        log.readInProgress = log.readQueue!
        log.readQueue = new ReadQueue()

        GlobalLogReader._processReadQueue(log)
    }

    static _processReadQueue(log: GlobalLog) {
        log.readInProgress!.queue = GlobalLogReader.combineReads(log.readInProgress!.queue)
        while (log.readInProgress!.queue.length > 0) {
            let fh = log.getReadFH()
            if (fh === null) {
                break
            }
            const item = log.readInProgress!.queue.shift()!
            GlobalLogReader._processReadQueueItem(item, fh)
                .then(() => {
                    if (fh !== null) log.doneReadFH(fh)
                })
                .catch((err) => {
                    console.error(err)
                    item.reject(err)
                    // if there was an error just close the file handle for now
                    if (fh !== null) log.closeReadFH(fh)
                })
        }
        // if all reads complete then clear readInProgress
        if (log.readInProgress!.queue.length === 0) {
            log.readInProgress = null
            // if readQuee has items then schedule to process
            if (log.readQueue!.queue.length > 0) {
                setTimeout(GlobalLogReader.processReadQueue, 0, log)
            }
        }
        // otherwise schedule processReadQueue to run again
        else {
            setTimeout(GlobalLogReader._processReadQueue, 0, log)
        }
    }

    /**
     * TODO: this improves throughput ~4X when all reads can be combined but needs to be
     * further profiled and tuned for real query patterns.
     *
     * If no reads are combined the additional cost is a matter of the time and memory
     * it takes to build the index and the GC churn it causes.
     *
     * This could be improved when stats counters are added for logs and then only
     * build indexes for logs over a certain RPS threshold.
     */
    static combineReads(items: ReadQueueItem[]): ReadQueueItem[] {
        // nothing to be combined
        if (items.length < 2) {
            return items
        }

        const itemsByLogId: Map<string, Map<string, ReadQueueItem[]>> = new Map()

        for (const item of items) {
            const logIdBase64 = item.logId.base64()
            if (!itemsByLogId.has(logIdBase64)) {
                itemsByLogId.set(logIdBase64, new Map())
            }
            const itemsByRead = itemsByLogId.get(logIdBase64)!
            const readKey = item.reads.join("-")
            if (!itemsByRead.has(readKey)) {
                itemsByRead.set(readKey, [])
            }
            const indexedItems = itemsByRead.get(readKey)!
            indexedItems.push(item)
        }

        const combinedReads = []

        for (const item of items) {
            const itemsByRead = itemsByLogId.get(item.logId.base64())!
            const readKey = item.reads.join("-")
            const indexedItems = itemsByRead.get(readKey)
            // if this has been deleted then reads have already been combined
            if (indexedItems === undefined) {
                continue
            }
            if (indexedItems.length > 1) {
                combinedReads.push(GlobalLogReader.combineReadsForItems(indexedItems))
                itemsByRead.delete(readKey)
            } else {
                combinedReads.push(item)
            }
        }

        return combinedReads
    }

    static combineReadsForItems(items: ReadQueueItem[]): ReadQueueItem {
        // each reader is waiting on a promise that can only be resolved/rejected
        // with the functions stored on the item so we create a new item with a
        // new promise/resolve/reject and then when that is completed we call
        // all of the original resolve/rejects
        let resolve: ReadQueueItem["resolve"]
        let reject: ReadQueueItem["reject"]

        const item: any = {
            logId: items[0].logId,
            reads: items[0].reads,
        }

        const promise = new Promise<Uint8Array[]>((res, rej) => {
            item.resolve = res
            item.reject = rej
            setTimeout(() => {
                item.promise
                    .then((u8s: Uint8Array[]) => {
                        for (const item of items) {
                            item.resolve(u8s)
                        }
                    })
                    .catch((err: any) => {
                        for (const item of items) {
                            item.reject(err)
                        }
                    })
            }, 0)
        })

        item.promise = promise

        return item
    }

    static async _processReadQueueItem(item: ReadQueueItem, fh: FileHandle) {
        if (item.reads.length === 0) {
            throw new Error("no reads")
        }
        if (item.reads.length % 2 !== 0) {
            throw new Error("odd number of reads")
        }
        const u8s: Uint8Array[] = []
        // reads is array of offsets and lengths
        for (let i = 0; i + 1 < item.reads.length; i += 2) {
            const offset = item.reads[i]
            const length = item.reads[i + 1]

            const buffer = new Uint8Array(length)

            const { bytesRead } = await fh.read({
                buffer,
                position: offset,
                length,
            })

            if (bytesRead !== length) {
                throw new Error(`read error offset=${offset} length=${length} bytesRead=${bytesRead}`)
            }

            u8s.push(buffer)
        }
        // resolve read queue item with the buffers read
        item.resolve(u8s)
    }
}
