import fs, { FileHandle } from "node:fs/promises"
import path from "node:path"

import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry from "../entry/global-log-entry"
import GlobalLogEntryFactory from "../entry/global-log-entry-factory"
import LogLogEntry from "../entry/log-log-entry"
import { GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH, GLOBAL_LOG_CHECKPOINT_INTERVAL } from "../globals"
import LogId from "../log-id"
import Server from "../server"
import GlobalLogIOQueue from "./io/global-log-io-queue"
import WriteIOOperation from "./io/write-io-operation"
import PersistedLog from "./persisted-log"

type LogOp = {
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
    isNew: boolean = false

    constructor(server: Server, isNew: boolean) {
        super(server)
        this.isNew = isNew
        const logFile = path.join(server.config.dataDir, server.config.hotLogFileName!)
        this.logFile = isNew ? `${logFile}.new` : `${logFile}.old`
    }

    logName(): string {
        return this.isNew ? "newHot" : "oldHot"
    }

    async _processReadLogEntry(
        fh: FileHandle,
        logId: LogId,
        entryNum: number,
        offset: number,
        length: number,
    ): Promise<[GlobalLogEntry, number]> {
        let nextCheckpointOffset =
            offset > GLOBAL_LOG_CHECKPOINT_INTERVAL
                ? offset % GLOBAL_LOG_CHECKPOINT_INTERVAL === 0
                    ? offset
                    : offset - (offset % GLOBAL_LOG_CHECKPOINT_INTERVAL) + GLOBAL_LOG_CHECKPOINT_INTERVAL
                : GLOBAL_LOG_CHECKPOINT_INTERVAL
        let u8, bytesRead
        // this should never happen because entry should never be written at a checkpoint boundary
        if (offset === nextCheckpointOffset) {
            throw new Error(`entry at checkpoint offset=${offset} length=${length}`)
        }
        // if entry crosses a checkpoint then we need to read past the checkpoint and combine the entry data around it
        else if (offset < nextCheckpointOffset && offset + length > nextCheckpointOffset) {
            length += GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH
            u8 = new Uint8Array(length)
            ;({ bytesRead } = await fh.read({ buffer: u8, position: offset, length }))
            if (bytesRead !== length) {
                throw new Error(
                    `bytesRead error log=${this.logName()} entryNum=${entryNum} offset=${offset} length=${length} bytesRead=${bytesRead}`,
                )
            }
            const checkpointOffset = nextCheckpointOffset - offset
            u8 = Buffer.concat([
                u8.slice(0, checkpointOffset),
                u8.slice(checkpointOffset + GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH),
            ])
        } else {
            u8 = new Uint8Array(length)
            ;({ bytesRead } = await fh.read({ buffer: u8, position: offset, length }))
            if (bytesRead !== length) {
                throw new Error(
                    `bytesRead error log=${this.logName()} entryNum=${entryNum} offset=${offset} length=${length} bytesRead=${bytesRead}`,
                )
            }
        }
        let entry
        try {
            entry = GlobalLogEntryFactory.fromU8(u8)
        } catch (err) {
            throw new Error(
                `error reading entry log=${this.logName()} logId=${logId.base64()} entryNum=${entryNum} offset=${offset} length=${length}`,
            )
        }
        if (entry.logId.base64() !== logId.base64()) {
            throw new Error(
                `logId mismatch log=${this.logName()} logId=${logId.base64()} entry.logId=${entry.logId.base64()} entryNum=${entryNum} offset=${offset} length=${length}`,
            )
        }
        if (!entry.verify()) {
            throw new Error(
                `crc verify error log=${this.logName()} entryNum=${entryNum} offset=${offset} length=${length}`,
            )
        }
        if (entry.entryNum !== entryNum) {
            throw new Error(
                `entryNum mismatch log=${this.logName()} entryNum=${entryNum} entry.entryNum=${entry.entryNum} offset=${offset} length=${length}`,
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
                    globalOps.push({ offset: entryOffset, op: op, entry: logEntry })
                }
                // this is a log entry for a log log
                else {
                    const logIdBase64 = op.logId.base64()
                    // create/get log offset for this logId
                    if (!logOps.has(logIdBase64)) {
                        logOps.set(logIdBase64, {
                            logId: op.logId,
                            maxEntryNum: this.server.getLog(op.logId).maxEntryNum(),
                            ops: [],
                        })
                    }
                    logOpInfo = logOps.get(logIdBase64)!
                    if (op.entryNum === null) {
                        op.entryNum = logOpInfo.maxEntryNum += 1
                    }
                    logEntry = new GlobalLogEntry({
                        logId: op.logId,
                        entryNum: op.entryNum,
                        entry: op.entry,
                    })
                    // and entry to local index which will be merged to global index after write completes
                    logOpInfo.ops.push({
                        offset: entryOffset,
                        op: op,
                        entry: logEntry,
                    })
                }
                let nextCheckpointOffset =
                    entryOffset > GLOBAL_LOG_CHECKPOINT_INTERVAL
                        ? entryOffset % GLOBAL_LOG_CHECKPOINT_INTERVAL === 0
                            ? entryOffset
                            : entryOffset -
                              (entryOffset % GLOBAL_LOG_CHECKPOINT_INTERVAL) +
                              GLOBAL_LOG_CHECKPOINT_INTERVAL
                        : GLOBAL_LOG_CHECKPOINT_INTERVAL
                // if this entry would cross a checkpoint boundary then add checkpoint
                if (entryOffset < nextCheckpointOffset && entryOffset + logEntry.byteLength() > nextCheckpointOffset) {
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset = nextCheckpointOffset - entryOffset
                    const checkpointEntry = new GlobalLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: logEntry.byteLength(),
                    })
                    // use Buffer here because this will never run in browser
                    const entryBuffer = Buffer.concat(logEntry.u8s())
                    // add beginning segment of entry before checkpoint
                    const beginU8 = new Uint8Array(entryBuffer.buffer, entryBuffer.byteOffset, lastEntryOffset)
                    u8s.push(beginU8)
                    writeBytes += lastEntryOffset
                    // add checkpoint entry
                    u8s.push(...checkpointEntry.u8s())
                    writeBytes += checkpointEntry.byteLength()
                    // add end segment of entry after checkpoint
                    const endU8 = new Uint8Array(
                        entryBuffer.buffer,
                        entryBuffer.byteOffset + lastEntryOffset,
                        logEntry.byteLength() - lastEntryOffset,
                    )
                    u8s.push(endU8)
                    writeBytes += logEntry.byteLength() - lastEntryOffset
                }
                // if we are exactly at checkpoint boundary then add a checkpoint
                else if (entryOffset === nextCheckpointOffset) {
                    // create checkpoint entry
                    // TODO: real offset?
                    const checkpointEntry = new GlobalLogCheckpoint({
                        lastEntryOffset: 0,
                        lastEntryLength: 0,
                    })
                    // add checkpoint entry
                    u8s.push(...checkpointEntry.u8s())
                    writeBytes += checkpointEntry.byteLength()
                    // need to update the offset to include the checkpoint entry
                    if (logOpInfo !== null) {
                        logOpInfo.ops.at(-1)!.offset += checkpointEntry.byteLength()
                    }
                    // add entry
                    u8s.push(...logEntry.u8s())
                    writeBytes += logEntry.byteLength()
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
                console.error("writeBytes mismatch", writeBytes, ret.bytesWritten)
                try {
                    if (ret.bytesWritten > 0) {
                        await this.truncate(this.byteLength)
                    }
                } catch (err) {
                    // we are in a corrupted state here but still need this to be correct
                    this.byteLength += ret.bytesWritten
                    throw new Error(
                        `Truncate failed after failed to write all bytes. log=${this.logName()} expected=${writeBytes} actual=${ret.bytesWritten}`,
                    )
                }
                throw new Error(
                    `Failed to write all bytes. log=${this.logName()} expected=${writeBytes} actual=${ret.bytesWritten}`,
                )
            }

            for (const opInfo of globalOps) {
                opInfo.op.bytesWritten = opInfo.entry.byteLength()
                // resolves promise for op
                opInfo.op.complete(opInfo.op)
            }

            for (const opInfo of logOps.values()) {
                for (const op of opInfo.ops) {
                    op.op.bytesWritten = op.entry.byteLength()
                    this.addEntryToIndex(op.entry as GlobalLogEntry, op.offset)
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
        return super.init(GlobalLogEntryFactory, GlobalLogCheckpoint, GLOBAL_LOG_CHECKPOINT_INTERVAL)
    }

    initGlobalLogEntry(entry: GlobalLogEntry, entryOffset: number): void {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed", entry)
        }
        this.addEntryToIndex(entry, entryOffset)
    }

    addEntryToIndex(entry: GlobalLogEntry, entryOffset: number): void {
        const persist = this.server.getLog(entry.logId)
        if (this.isNew) {
            persist.addNewHotLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
        } else {
            persist.addOldHotLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
        }
    }
}
