import fs, { FileHandle } from "node:fs/promises"

import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry from "../entry/global-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL, ReadQueueItem } from "../globals"
import GlobalLog from "./global-log"
import ReadQueue from "./read-queue"

export default class GlobalLogReader {
    static async initGlobal(log: GlobalLog): Promise<void> {
        // this should only be run at startup so these should always be null
        if (log.fh !== null || log.readBlocked !== null || log.writeBlocked !== null) {
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
                    const res = GlobalLogEntry.fromPartialU8(lastEntryU8)
                    if (res.err) {
                        throw res.err
                    } else if (res.needBytes) {
                        throw new Error("Error getting entry from checkpoint boundary")
                    }
                    const entry = res.entry as GlobalLogEntry
                    const entryOffset = bytesRead - lastEntryOffset
                    GlobalLogReader.addEntryToLog(log, entry, entryOffset)
                    u8BytesRead += entry.byteLength()
                }
            }

            while (u8BytesRead < ret.bytesRead) {
                const res = GlobalLogEntry.fromPartialU8(
                    new Uint8Array(currU8.buffer, currU8.byteOffset + u8BytesRead, currU8.byteLength - u8BytesRead),
                )
                if (res.err) {
                    throw res.err
                } else if (res.needBytes) {
                    // swap last and curr buffers - on next iteration new data is read into old last and last is the old curr
                    ;[lastU8] = [currU8]
                    break
                }
                const entry = res.entry as GlobalLogEntry
                const entryOffset = bytesRead + u8BytesRead
                GlobalLogReader.addEntryToLog(log, entry, entryOffset)
                u8BytesRead += entry.byteLength()
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
            log.index.set(entry.logId.base64(), {
                en: [],
                cm: [],
                lc: [],
            })
        }
        const logIndex = log.index.get(entry.logId.base64())!
        // log config is written in either CreateLog or SetConfig command
        if (entry.entry instanceof CreateLogCommand || entry.entry instanceof SetConfigCommand) {
            // store as last config if it is more recent
            if (logIndex.lc.length === 0 || logIndex.lc[0] < entryOffset) {
                logIndex.lc[0] = entryOffset
                logIndex.lc[1] = entry.byteLength()
            }
            // also add to command entries index because we need all commands + all entries to get accurate total length
            logIndex.cm.push(entryOffset, entry.byteLength())
        } else if (entry.entry instanceof CommandLogEntry) {
            // add to command entries index
            logIndex.cm.push(entryOffset, entry.byteLength())
        } else {
            // add to entires index
            logIndex.en.push(entryOffset, entry.byteLength())
        }
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
        while (log.readInProgress!.queue.length > 0) {
            let fh = log.openFH()
            if (fh === null) {
                break
            }
            const item = log.readInProgress!.queue.shift()!
            GlobalLogReader._processReadQueueItem(item, fh)
                .then(() => {
                    if (fh !== null) log.doneFH(fh)
                })
                .catch((err) => {
                    console.error(err)
                    item.reject(err)
                    // if there was an error just close the file handle for now
                    if (fh !== null) log.closeFH(fh)
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
