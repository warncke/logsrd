import fs, { FileHandle } from "node:fs/promises"

import GlobalLogCheckpoint from "../../entry/global-log-checkpoint"
import GlobalLogEntry from "../../entry/global-log-entry"
import GlobalLogEntryFactory from "../../entry/global-log-entry-factory"
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
    entry: GlobalLogEntry | LogLogEntry
}
type LogOpInfo = {
    logId: LogId
    maxEntryNum: number
    ops: LogOp[]
}

export default class GlobalLog extends PersistedLog {
    maxReadFHs: number = 16
    ioQueue = new GlobalLogIOQueue()
    isColdLog: boolean = false
    isOldHotLog: boolean = false
    isNewHotLog: boolean = false

    constructor({
        isColdLog = false,
        isNewHotLog = false,
        isOldHotLog = false,
        logFile,
        ...args
    }: PersistLogArgs & { isColdLog?: boolean; isNewHotLog?: boolean; isOldHotLog?: boolean; logFile: string }) {
        super(args)
        this.isColdLog = isColdLog
        this.isNewHotLog = isNewHotLog
        this.isOldHotLog = isOldHotLog
        this.logFile = logFile
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

    async processWriteOps(ops: WriteIOOperation[]): Promise<void> {
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
            // add all items from queue to list of u8s to write
            for (const op of ops) {
                // offset of entry from length of file + bytes written in current write
                const entryOffset = this.byteLength + writeBytes
                let logEntry: GlobalLogEntry | LogLogEntry
                let logOpInfo: LogOpInfo | null = null
                // this is a command entry for the global log
                if (op.logId === null) {
                    // global logs are ephemeral so they do not have a real entryNum
                    logEntry = new LogLogEntry({ entry: op.entry, entryNum: 0 })
                    globalOps.push({ entryNum: 0, offset: entryOffset, op: op, entry: logEntry })
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
                        entry: logEntry,
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
                    // we are in a corrupted state here but still need this to be correct
                    this.byteLength += ret.bytesWritten
                    throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
                }
            }

            for (const opInfo of globalOps) {
                opInfo.op.bytesWritten = opInfo.entry.byteLength()
                // resolves promise for op
                opInfo.op.complete(opInfo.op)
            }

            for (const opInfo of logOps.values()) {
                const log = this.persist.getLog(opInfo.logId)
                for (const op of opInfo.ops) {
                    op.op.bytesWritten = op.entry.byteLength()
                    // global log writes always go to hot log
                    log.addNewHotLogEntry(op.op.entry, op.entryNum, op.offset, op.entry.byteLength())
                    // set the entry for the op to the created log entry
                    op.op.entry = op.entry
                    // resolves promise for op
                    op.op.complete(op.op)
                }
            }
        } catch (err) {
            // reject promises for all iOps
            for (const op of ops) {
                op.completeWithError(err)
            }
            // rethrow error to notify caller
            throw err
        }
    }

    async init(): Promise<void> {
        return super.init(GlobalLogEntryFactory, GLOBAL_LOG_CHECKPOINT_INTERVAL)
    }

    initGlobalLogEntry(entry: GlobalLogEntry, entryOffset: number): void {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed", entry)
        }
        const persistLog = this.persist.getLog(entry.logId)
        if (this.isNewHotLog) {
            persistLog.addNewHotLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
        } else if (this.isColdLog) {
            persistLog.addColdLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
        } else if (this.isOldHotLog) {
            persistLog.addOldHotLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
        } else {
            throw new Error("unknown log type")
        }
    }
}
