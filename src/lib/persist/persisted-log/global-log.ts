import fs, { FileHandle } from "node:fs/promises"

import GlobalLogCheckpoint from "../../entry/global-log-checkpoint"
import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import GlobalLogEntryFactory from "../../global-log-entry-factory"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL, GLOBAL_LOG_PREFIX_BYTE_LENGTH, PersistLogArgs } from "../../globals"
import LogEntry from "../../log-entry"
import LogId from "../../log-id"
import GlobalLogIOQueue from "../global-log-io-queue"
import IOOperation from "../io/io-operation"
import ReadIOOperation from "../io/read-io-operation"
import WriteIOOperation from "../io/write-io-operation"
import PersistedLog from "./persisted-log"

type LogIop = {
    entryNum: number
    offset: number
    iOp: WriteIOOperation
}
type LogIopInfo = {
    logId: LogId
    maxEntryNum: number
    iOps: LogIop[]
}

export default class GlobalLog extends PersistedLog {
    maxReadFHs: number = 16
    ioQueue = new GlobalLogIOQueue()

    constructor(args: PersistLogArgs) {
        super(args)
    }

    enqueueIOp(iop: IOOperation): void {
        this.ioQueue.enqueue(iop)

        if (!this.ioBlocked && this.ioInProgress === null) {
            this.processIOps()
        }
    }

    processIOps() {
        if (!this.ioBlocked) {
            return
        }
        if (this.ioInProgress !== null) {
            return
        }
        this.ioInProgress = this.processIOpsAsync()
            .catch((err) => {
                console.error(err)
            })
            .then(() => {
                if (this.ioQueue.opPending()) {
                    setTimeout(() => {
                        this.processIOps()
                    }, 0)
                }
            })
    }

    async processIOpsAsync(): Promise<void> {
        if (!this.ioQueue.opPending()) {
            return
        }
        const [readOps, writeOps] = this.ioQueue.getReady()

        await Promise.all([this.processReads(readOps), this.processWrites(writeOps)])
    }

    async processReads(ops: ReadIOOperation[]): Promise<void> {}

    async processWrites(iOps: WriteIOOperation[]): Promise<void> {
        try {
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // keep track of the number of bytes expected to be written
            let writeBytes = 0
            // starts with a positive number that is the number of bytes since the last checkpoint
            let checkpointOffset =
                this.byteLength > GLOBAL_LOG_CHECKPOINT_INTERVAL
                    ? this.byteLength % GLOBAL_LOG_CHECKPOINT_INTERVAL
                    : this.byteLength
            // keep track of logOffset for each logId as this may be incremented with multiple writes during a batch
            const logIops = new Map<string, LogIopInfo>()
            // offset of entry from length of file + bytes written in current write
            const entryOffset = this.byteLength + writeBytes
            // add all items from queue to list of u8s to write
            for (const iOp of iOps) {
                let logEntry: LogEntry
                let logIopInfo: LogIopInfo | null = null
                // this is a command entry for the global log
                if (iOp.logId === null) {
                    // global logs are ephemeral so they do not have a real entryNum
                    logEntry = new LogLogEntry({ entry: iOp.entry, entryNum: 0 })
                }
                // this is a log entry for a log log
                else {
                    const logIdBase64 = iOp.logId.base64()
                    // create/get log offset for this logId
                    if (!logIops.has(logIdBase64)) {
                        logIops.set(logIdBase64, {
                            logId: iOp.logId,
                            maxEntryNum: this.persist.getLog(iOp.logId).maxEntryNum(),
                            iOps: [],
                        })
                    }
                    logIopInfo = logIops.get(logIdBase64)!
                    logIopInfo.maxEntryNum += 1
                    logEntry = new GlobalLogEntry({
                        logId: iOp.logId,
                        entryNum: logIopInfo.maxEntryNum,
                        entry: iOp.entry,
                    })
                    // and entry to local index which will be merged to global index after write completes
                    logIopInfo.iOps.push({
                        entryNum: logIopInfo.maxEntryNum,
                        offset: entryOffset,
                        iOp: iOp,
                    })
                }
                // bytes since last checkpoint including this entry
                const bytesSinceCheckpoint = checkpointOffset + writeBytes + logEntry.byteLength()
                // if this entry would cross or end at checkpoint boundardy then add checkpoint
                if (bytesSinceCheckpoint >= GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset = bytesSinceCheckpoint - GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // create checkpoint entry
                    const checkpointEntry = new GlobalLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: logEntry.byteLength(),
                    })
                    // offset becomes negative because now we need an additional GLOBAL_LOG_CHECKPOINT_INTERVAL
                    // bytes before the next offset
                    checkpointOffset = -(writeBytes + lastEntryOffset)
                    // if entry ends directly at checkpoint then add before
                    if (lastEntryOffset === logEntry.byteLength()) {
                        // add log entry
                        u8s.push(...logEntry.u8s())
                        writeBytes += logEntry.byteLength()
                        // add checkpoint entry
                        u8s.push(...checkpointEntry.u8s())
                        writeBytes += checkpointEntry.byteLength()
                    }
                    // otherwise split entry and add before/after checkpoint
                    else {
                        // use Buffer here because this will never run in browser
                        const entryBuffer = Buffer.concat(logEntry.u8s(), logEntry.byteLength())
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
                    u8s.push(...logEntry.u8s())
                    writeBytes += logEntry.byteLength()
                }
            }

            const ret = await (await this.getWriteFH()).writev(u8s)

            if (ret.bytesWritten === writeBytes) {
                // sync data only as we do not care about metadata
                await (await this.getWriteFH()).datasync()
                // update internal file length
                this.byteLength += ret.bytesWritten
            } else {
                try {
                    await this.truncate(this.byteLength)
                } catch (err) {
                    this.byteLength += ret.bytesWritten
                    throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
                }
            }

            for (const iOpInfo of logIops.values()) {
                const log = this.persist.getLog(iOpInfo.logId)
                for (const iOp of iOpInfo.iOps) {
                    iOp.iOp.bytesWritten = iOp.iOp.entry.byteLength()
                    // global log writes always go to hot log
                    log.addNewHotLogEntry(iOp.iOp.entry, iOp.entryNum, iOp.offset, iOp.iOp.entry.byteLength())
                    // resolves promise for iOp
                    iOp.iOp.complete()
                }
            }
        } catch (err) {
            // reject promises for all iOps
            for (const iOp of iOps) {
                iOp.completeWithError(err)
            }
            // rethrow error to notify caller
            throw err
        }
    }

    async init(): Promise<void> {
        if (this.ioBlocked || this.ioInProgress !== null) {
            throw new Error("Error starting initGlobal")
        }
        let fh: FileHandle | null = null
        try {
            fh = await fs.open(this.logFile, "r")
        } catch (err: any) {
            // ignore if file does not exist - it will be created on open for write
            if (err.code === "ENOENT") {
                return
            }
            throw err
        }

        try {
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
                    // if the last entry did not end on checkpoint boundary then need to combine from last and curr
                    if (checkpoint.lastEntryOffset !== checkpoint.lastEntryLength) {
                        const lastEntryU8 = Buffer.concat([
                            new Uint8Array(lastU8!.buffer, lastU8!.byteLength - checkpoint.lastEntryLength),
                            new Uint8Array(currU8.buffer, 0, checkpoint.lastEntryOffset),
                        ])
                        const res = GlobalLogEntryFactory.fromPartialU8(lastEntryU8)
                        if (res.err) {
                            throw res.err
                        } else if (res.needBytes) {
                            throw new Error("Error getting entry from checkpoint boundary")
                        }
                        const entry = res.entry
                        const entryOffset = bytesRead - checkpoint.lastEntryOffset
                        // handle command log entries
                        if (entry instanceof LogLogEntry) {
                            console.log(entry, entry.byteLength())
                        }
                        // otherwise this is log entry
                        else {
                            this.initEntry(entry as GlobalLogEntry, entryOffset)
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
                        this.initEntry(entry as GlobalLogEntry, entryOffset)
                    }
                    u8BytesRead += entry!.byteLength()
                }

                bytesRead += ret.bytesRead
                // if we did not read requested bytes then end of file reached
                if (ret.bytesRead < GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                    break
                }
            }

            this.byteLength = bytesRead
        } finally {
            if (fh !== null) {
                await fh.close()
            }
        }
    }

    initEntry(entry: GlobalLogEntry, globalOffset: number): void {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed", entry)
        }
        const persistLog = this.persist.getLog(entry.logId)
        if (this.isNewHotLog) {
            persistLog.addNewHotLogEntry(entry, entry.entryNum, globalOffset, entry.byteLength())
        } else if (this.isColdLog) {
            persistLog.addColdLogEntry(entry, entry.entryNum, globalOffset, entry.byteLength())
        } else if (this.isOldHotLog) {
            persistLog.addOldHotLogEntry(entry, entry.entryNum, globalOffset, entry.byteLength())
        } else {
            throw new Error("unknown log type")
        }
    }
}
