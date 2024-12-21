import path from "node:path"

import LogLogCheckpoint from "../../entry/log-log-checkpoint"
import LogLogEntry from "../../entry/log-log-entry"
import LogLogEntryFactory from "../../entry/log-log-entry-factory"
import { LOG_LOG_CHECKPOINT_INTERVAL, PersistLogArgs } from "../../globals"
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

    async processWriteOps(ops: WriteIOOperation[]): Promise<void> {
        try {
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // keep track of the number of bytes expected to be written
            let writeBytes = 0
            // starts with a positive number that is the number of bytes since the last checkpoint
            let checkpointOffset =
                this.byteLength > LOG_LOG_CHECKPOINT_INTERVAL
                    ? this.byteLength % LOG_LOG_CHECKPOINT_INTERVAL
                    : this.byteLength
            let maxEntryNum = this.persistLog.maxEntryNum()
            const opInfo: OpInfo[] = []
            // add all items from queue to list of u8s to write
            for (const op of ops) {
                // offset of entry from length of file + bytes written in current write
                const entryOffset = this.byteLength + writeBytes
                const entry = new LogLogEntry({ entry: op.entry, entryNum: (maxEntryNum += 1) })
                opInfo.push({
                    entry,
                    offset: entryOffset,
                    op,
                })
                // bytes since last checkpoint including this entry
                const bytesSinceCheckpoint = checkpointOffset + writeBytes + entry.byteLength()
                // if this entry would cross or end at checkpoint boundardy then add checkpoint
                if (bytesSinceCheckpoint >= LOG_LOG_CHECKPOINT_INTERVAL) {
                    // length of buffer segment to write before checkpoint
                    const lastEntryOffset = bytesSinceCheckpoint - LOG_LOG_CHECKPOINT_INTERVAL
                    // create checkpoint entry
                    const checkpointEntry = new LogLogCheckpoint({
                        lastEntryOffset,
                        lastEntryLength: entry.byteLength(),
                        lastConfigOffset: this.persistLog.lastLogConfigOffset(),
                    })
                    // offset becomes negative because now we need an additional LOG_LOG_CHECKPOINT_INTERVAL
                    // bytes before the next offset
                    checkpointOffset = -(writeBytes + lastEntryOffset)
                    // if entry ends directly at checkpoint then add before
                    if (lastEntryOffset === entry.byteLength()) {
                        // add log entry
                        u8s.push(...entry.u8s())
                        writeBytes += entry.byteLength()
                        // add checkpoint entry
                        u8s.push(...checkpointEntry.u8s())
                        writeBytes += checkpointEntry.byteLength()
                    }
                    // otherwise split entry and add before/after checkpoint
                    else {
                        // use Buffer here because this will never run in browser
                        const entryBuffer = Buffer.concat(entry.u8s(), entry.byteLength())
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
                    throw new Error(`Failed to write all bytes. Expected: ${writeBytes} Actual: ${ret.bytesWritten}`)
                }
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
