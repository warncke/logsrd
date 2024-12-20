import fs, { FileHandle } from "node:fs/promises"

import CreateLogCommand from "../../entry/command/create-log-command"
import SetConfigCommand from "../../entry/command/set-config-command"
import GlobalLogCheckpoint from "../../entry/global-log-checkpoint"
import GlobalLogEntry from "../../entry/global-log-entry"
import GlobalLogEntryFactory from "../../entry/global-log-entry-factory"
import LogEntry from "../../entry/log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL, IOOperationType, PersistLogArgs, ReadIOOperation } from "../../globals"
import LogId from "../../log-id"
import GlobalLogIOQueue from "../io/global-log-io-queue"
import IOOperation from "../io/io-operation"
import ReadConfigIOOperation from "../io/read-config-io-operation"
import ReadHeadIOOperation from "../io/read-head-io-operation"
import ReadRangeIOOperation from "../io/read-range-io-operation"
import WriteIOOperation from "../io/write-io-operation"
import PersistedLog from "./persisted-log"

type LogOp = {
    entryNum: number
    offset: number
    op: WriteIOOperation
    logEntry: GlobalLogEntry | LogLogEntry
}
type LogOpInfo = {
    logId: LogId
    maxEntryNum: number
    ops: LogOp[]
}

export default class GlobalLog extends PersistedLog {
    maxReadFHs: number = 16
    ioQueue = new GlobalLogIOQueue()

    constructor(args: PersistLogArgs) {
        super(args)
    }

    enqueueIOp(iOp: IOOperation): void {
        this.ioQueue.enqueue(iOp)

        if (!this.ioBlocked && this.ioInProgress === null) {
            this.processIOps()
        }
    }

    processIOps() {
        if (this.ioBlocked) {
            return
        }
        if (this.ioInProgress !== null) {
            return
        }
        this.ioInProgress = this.processIOpsAsync().then(() => {
            this.ioInProgress = null
            if (this.ioQueue.opPending()) {
                setTimeout(() => {
                    this.processIOps()
                }, 0)
            }
        })
    }

    async processIOpsAsync(): Promise<void> {
        try {
            if (!this.ioQueue.opPending()) {
                return
            }
            const [readOps, writeOps] = this.ioQueue.getReady()
            await Promise.all([this.processReads(readOps), this.processWrites(writeOps)])
        } catch (err) {
            console.error(err)
        }
    }

    async processReads(ops: ReadIOOperation[]): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                this._processReadOps(ops, resolve)
            } catch (err) {
                reject(err)
            }
        })
    }

    _processReadOps(ops: ReadIOOperation[], resolve: (value: void | PromiseLike<void>) => void): void {
        while (ops.length > 0) {
            let fh = this.getReadFH()
            if (fh === null) {
                break
            }
            const op = ops.shift()!
            this._processReadOp(op, fh)
                .then(() => this.doneReadFH(fh!))
                .catch((err) => {
                    op.completeWithError(err)
                    if (fh !== null) this.closeReadFH(fh)
                })
        }
        if (ops.length === 0) {
            resolve()
        } else {
            setTimeout(() => {
                this._processReadOps(ops, resolve)
            }, 0)
        }
    }

    async _processReadOp(op: ReadIOOperation, fh: FileHandle): Promise<void> {
        switch (op.op) {
            case IOOperationType.READ_HEAD:
                return this._processReadHeadOp(op as ReadHeadIOOperation, fh)
            case IOOperationType.READ_RANGE:
                return this._processReadRangeOp(op as ReadRangeIOOperation, fh)
            case IOOperationType.READ_CONFIG:
                return this._processReadConfigOp(op as ReadConfigIOOperation, fh)
            default:
                throw new Error("unknown IO op")
        }
    }

    async _processReadRangeOp(op: ReadRangeIOOperation, fh: FileHandle): Promise<void> {}

    async _processReadHeadOp(op: ReadHeadIOOperation, fh: FileHandle): Promise<void> {
        const log = this.persist.getLog(op.logId!)
        const [entry, bytesRead] = await this._processReadGlobalLogEntry(fh, op.logId!, ...log.getLastGlobalEntry())
        op.entry = entry
        op.bytesRead = bytesRead
        op.complete(op)
    }

    async _processReadConfigOp(op: ReadConfigIOOperation, fh: FileHandle): Promise<void> {
        const log = this.persist.getLog(op.logId!)
        const [entry, bytesRead] = await this._processReadGlobalLogEntry(fh, op.logId!, ...log.getLastGlobalConfig())
        op.entry = entry
        op.bytesRead = bytesRead
        op.complete(op)
    }

    async _processReadGlobalLogEntry(
        fh: FileHandle,
        logId: LogId,
        entryNum: number,
        offset: number,
        length: number,
    ): Promise<[GlobalLogEntry, number]> {
        const u8 = new Uint8Array(length)
        const { bytesRead } = await fh.read({ buffer: u8, position: offset, length })
        if (bytesRead !== length) {
            throw new Error(
                `bytesRead error entryNum=${entryNum} offset=${offset} length=${length} bytesRead=${bytesRead}`,
            )
        }
        const entry = GlobalLogEntryFactory.fromU8(u8)
        if (entry.logId.base64() !== logId.base64()) {
            throw new Error(
                `logId mismatch logId=${logId.base64()} entry.logId=${entry.logId.base64()} entryNum=${entryNum} offset=${offset} length=${length}`,
            )
        }
        if (!entry.verify()) {
            throw new Error(`crc verify error entryNum=${entryNum} offset=${offset} length=${length}`)
        }
        if (entry.entryNum !== entryNum) {
            throw new Error(
                `entryNum mismatch entryNum=${entryNum} entry.entryNum=${entry.entryNum} offset=${offset} length=${length}`,
            )
        }
        return [entry, bytesRead]
    }

    async processWrites(ops: WriteIOOperation[]): Promise<void> {
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
            const logOps = new Map<string, LogOpInfo>()
            const globalOps: LogOp[] = []
            // offset of entry from length of file + bytes written in current write
            const entryOffset = this.byteLength + writeBytes
            // add all items from queue to list of u8s to write
            for (const op of ops) {
                let logEntry: GlobalLogEntry | LogLogEntry
                let logOpInfo: LogOpInfo | null = null
                // this is a command entry for the global log
                if (op.logId === null) {
                    // global logs are ephemeral so they do not have a real entryNum
                    logEntry = new LogLogEntry({ entry: op.entry, entryNum: 0 })
                    globalOps.push({ entryNum: 0, offset: entryOffset, op: op, logEntry })
                }
                // this is a log entry for a log log
                else {
                    const logIdBase64 = op.logId.base64()
                    // create/get log offset for this logId
                    if (!logOps.has(logIdBase64)) {
                        logOps.set(logIdBase64, {
                            logId: op.logId,
                            maxEntryNum: this.persist.getLog(op.logId).maxEntryNum(),
                            ops: [],
                        })
                    }
                    logOpInfo = logOps.get(logIdBase64)!
                    logOpInfo.maxEntryNum += 1
                    logEntry = new GlobalLogEntry({
                        logId: op.logId,
                        entryNum: logOpInfo.maxEntryNum,
                        entry: op.entry,
                    })
                    // and entry to local index which will be merged to global index after write completes
                    logOpInfo.ops.push({
                        entryNum: logOpInfo.maxEntryNum,
                        offset: entryOffset,
                        op: op,
                        logEntry,
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

            for (const opInfo of globalOps) {
                opInfo.op.bytesWritten = opInfo.logEntry.byteLength()
            }

            for (const opInfo of logOps.values()) {
                const log = this.persist.getLog(opInfo.logId)
                for (const op of opInfo.ops) {
                    op.op.bytesWritten = op.logEntry.byteLength()
                    // global log writes always go to hot log
                    log.addNewHotLogEntry(op.op.entry, op.entryNum, op.offset, op.logEntry.byteLength())
                    // set the entry for the op to the created log entry
                    op.op.entry = op.logEntry
                    // resolves promise for iOp
                    op.op.complete(op.op)
                }
            }
        } catch (err) {
            // reject promises for all iOps
            for (const iOp of ops) {
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
            persistLog.addNewHotLogEntry(entry.entry, entry.entryNum, globalOffset, entry.byteLength())
        } else if (this.isColdLog) {
            persistLog.addColdLogEntry(entry.entry, entry.entryNum, globalOffset, entry.byteLength())
        } else if (this.isOldHotLog) {
            persistLog.addOldHotLogEntry(entry.entry, entry.entryNum, globalOffset, entry.byteLength())
        } else {
            throw new Error("unknown log type")
        }
    }
}
