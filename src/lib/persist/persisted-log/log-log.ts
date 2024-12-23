import { FileHandle } from "node:fs/promises"
import path from "node:path"

import LogLogCheckpoint from "../../entry/log-log-checkpoint"
import LogLogEntry from "../../entry/log-log-entry"
import LogLogEntryFactory from "../../entry/log-log-entry-factory"
import { LOG_LOG_CHECKPOINT_BYTE_LENGTH, LOG_LOG_CHECKPOINT_INTERVAL, PersistLogArgs } from "../../globals"
import LogId from "../../log-id"
import WriteIOOperation from "../io/write-io-operation"
import PersistLog from "../persist-log"
import PersistedLog from "../persisted-log/persisted-log"

type OpInfo = {
    offset: number
    op: WriteIOOperation
    entry: LogLogEntry
}

export default class LogLog extends PersistedLog {
    persistLog: PersistLog
    maxReadFHs: number = 4

    constructor({ persistLog, ...args }: PersistLogArgs & { persistLog: PersistLog }) {
        super(args)
        this.persistLog = persistLog
        this.logFile = path.join(
            this.persist.config.logDir!,
            this.persistLog.logId.logDirPrefix(),
            `${this.persistLog.logId.base64()}.log`,
        )
    }

    logName(): string {
        return `log ${this.persistLog.logId.base64()}`
    }

    async _processReadLogEntry(
        fh: FileHandle,
        logId: LogId,
        entryNum: number,
        offset: number,
        length: number,
    ): Promise<[LogLogEntry, number]> {
        let nextCheckpointOffset =
            offset > LOG_LOG_CHECKPOINT_INTERVAL
                ? offset % LOG_LOG_CHECKPOINT_INTERVAL === 0
                    ? offset
                    : offset - (offset % LOG_LOG_CHECKPOINT_INTERVAL) + LOG_LOG_CHECKPOINT_INTERVAL
                : LOG_LOG_CHECKPOINT_INTERVAL
        let u8, bytesRead
        // this should never happen because entry should never be written at a checkpoint boundary
        if (offset === nextCheckpointOffset) {
            throw new Error(`entry at checkpoint offset=${offset} length=${length}`)
        }
        // if entry crosses a checkpoint then we need to read past the checkpoint and combine the entry data around it
        else if (offset < nextCheckpointOffset && offset + length > nextCheckpointOffset) {
            length += LOG_LOG_CHECKPOINT_BYTE_LENGTH
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
                u8.slice(checkpointOffset + LOG_LOG_CHECKPOINT_BYTE_LENGTH),
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
            entry = LogLogEntryFactory.fromU8(u8)
        } catch (err) {
            throw new Error(
                `error reading entry log=${this.logName()} logId=${logId.base64()} entryNum=${entryNum} offset=${offset} length=${length}`,
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
            let maxEntryNum = this.persistLog.maxEntryNum()
            const opInfo: OpInfo[] = []
            // add all items from queue to list of u8s to write
            for (const op of ops) {
                // offset of entry from length of file + bytes written in current write
                const entryOffset = this.byteLength + writeBytes
                // if op does not have entryNum, assign it the next available entryNum
                if (op.entryNum === null) {
                    op.entryNum = maxEntryNum += 1
                }
                const entry = new LogLogEntry({ entry: op.entry, entryNum: op.entryNum })
                opInfo.push({
                    entry,
                    offset: entryOffset,
                    op,
                })
                let nextCheckpointOffset =
                    entryOffset > LOG_LOG_CHECKPOINT_INTERVAL
                        ? entryOffset % LOG_LOG_CHECKPOINT_INTERVAL === 0
                            ? entryOffset
                            : entryOffset - (entryOffset % LOG_LOG_CHECKPOINT_INTERVAL) + LOG_LOG_CHECKPOINT_INTERVAL
                        : LOG_LOG_CHECKPOINT_INTERVAL
                // if this entry would cross a checkpoint boundary then add checkpoint
                if (entryOffset < nextCheckpointOffset && entryOffset + entry.byteLength() > nextCheckpointOffset) {
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset = nextCheckpointOffset - entryOffset
                    const checkpointEntry = new LogLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: entry.byteLength(),
                        lastConfigOffset: this.persistLog.lastLogConfigOffset(),
                    })
                    // use Buffer here because this will never run in browser
                    const entryBuffer = Buffer.concat(entry.u8s())
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
                        entry.byteLength() - lastEntryOffset,
                    )
                    u8s.push(endU8)
                    writeBytes += entry.byteLength() - lastEntryOffset
                }
                // if we are exactly at checkpoint boundary then add a checkpoint
                else if (entryOffset === nextCheckpointOffset) {
                    // create checkpoint entry
                    // TODO: real offset?
                    const checkpointEntry = new LogLogCheckpoint({
                        lastEntryOffset: 0,
                        lastEntryLength: 0,
                        lastConfigOffset: this.persistLog.lastLogConfigOffset(),
                    })
                    // add checkpoint entry
                    u8s.push(...checkpointEntry.u8s())
                    writeBytes += checkpointEntry.byteLength()
                    // need to update the offset to include the checkpoint entry
                    opInfo.at(-1)!.offset += checkpointEntry.byteLength()
                    // add entry
                    u8s.push(...entry.u8s())
                    writeBytes += entry.byteLength()
                }
                // otherwise add entry
                else {
                    u8s.push(...entry.u8s())
                    writeBytes += entry.byteLength()
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
                    throw new Error(
                        `Truncate failed after failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`,
                    )
                }
                throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
            }
            // complete ops
            for (const op of opInfo) {
                op.op.entry = op.entry
                op.op.bytesWritten = op.entry.byteLength()
                this.persistLog.addLogLogEntry(op.entry, op.entry.entryNum, op.offset, op.entry.byteLength())
                op.op.complete(op.op)
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

    // TODO: initPartial from checkpoint
    async init(): Promise<void> {
        return super.init(LogLogEntryFactory, LOG_LOG_CHECKPOINT_INTERVAL)
    }

    initLogLogEntry(entry: LogLogEntry, entryOffset: number) {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed", entry)
        }
        this.persistLog.addLogLogEntry(entry.entry, entry.entryNum, entryOffset, entry.byteLength())
    }
}
