import fs, { FileHandle } from "node:fs/promises"

import GlobalLogCheckpoint from "../../entry/global-log-checkpoint"
import GlobalLogEntry from "../../entry/global-log-entry"
import GlobalLogEntryFactory from "../../entry/global-log-entry-factory"
import LogLogEntry from "../../entry/log-log-entry"
import LogLogEntryFactory from "../../entry/log-log-entry-factory"
import { IOOperationType, PersistLogArgs, ReadIOOperation } from "../../globals"
import LogConfig from "../../log-config"
import LogId from "../../log-id"
import Persist from "../../persist"
import GlobalLogIOQueue from "../io/global-log-io-queue"
import IOOperation from "../io/io-operation"
import IOQueue from "../io/io-queue"
import ReadConfigIOOperation from "../io/read-config-io-operation"
import ReadEntriesIOOperation from "../io/read-entries-io-operation"
import ReadHeadIOOperation from "../io/read-head-io-operation"
import ReadRangeIOOperation from "../io/read-range-io-operation"
import WriteIOOperation from "../io/write-io-operation"

export default class PersistedLog {
    config: LogConfig
    logFile: string = ""
    persist: Persist
    ioQueue: GlobalLogIOQueue | IOQueue = new IOQueue()
    writeFH: FileHandle | null = null
    freeReadFhs: Array<FileHandle> = []
    openReadFhs: Array<FileHandle> = []
    openingReadFhs: number = 0
    maxReadFHs: number = 1
    byteLength: number = 0
    ioBlocked: boolean = false
    ioInProgress: Promise<void> | null = null

    // should always be instantiated through GlobalLog or LogLog
    constructor({ config, persist }: PersistLogArgs) {
        this.config = config
        this.persist = persist
    }

    async blockIO(): Promise<void> {
        if (this.ioBlocked) {
            throw new Error("IO already blocked")
        }
        this.ioBlocked = true
        if (this.ioInProgress !== null) {
            await this.ioInProgress
        }
    }

    unblockIO() {
        if (!this.ioBlocked) {
            throw new Error("IO not blocked")
        }
        this.ioBlocked = false
        this.processOps()
    }

    async waitInProgress(): Promise<void> {
        if (this.ioInProgress !== null) {
            await this.ioInProgress
        }
    }

    async closeAllFHs(): Promise<void> {
        await Promise.all([Promise.all(this.openReadFhs.map((fh) => fh.close())), this.closeWriteFH()])
        this.openReadFhs = []
        this.freeReadFhs = []
    }

    getReadFH(): FileHandle | null {
        if (this.freeReadFhs.length > 0) {
            return this.freeReadFhs.pop()!
        }
        // TODO: add global limit
        if (this.openReadFhs.length + this.openingReadFhs < this.maxReadFHs) {
            // increment open here because it needs to be synchronous
            this.openingReadFhs += 1
            fs.open(this.logFile, "r")
                .then((fh) => {
                    this.openingReadFhs -= 1
                    this.openReadFhs.push(fh)
                    this.freeReadFhs.push(fh)
                })
                .catch((err) => {
                    this.openingReadFhs -= 1
                    console.error(err)
                })
        }
        return null
    }

    closeReadFH(fh: FileHandle): void {
        fh.close()
            .then(() => {
                this.openReadFhs = this.openReadFhs.filter((f) => f !== fh)
            })
            .catch((err) => {
                console.error(err)
                this.openReadFhs = this.openReadFhs.filter((f) => f !== fh)
            })
    }

    doneReadFH(fh: FileHandle): void {
        this.freeReadFhs.push(fh)
    }

    async getWriteFH(): Promise<FileHandle> {
        if (this.writeFH === null) {
            this.writeFH = await fs.open(this.logFile, "a")
        }
        return this.writeFH
    }

    async closeWriteFH(): Promise<void> {
        if (this.writeFH !== null) {
            await this.writeFH.close()
            this.writeFH = null
        }
    }

    enqueueOp(op: IOOperation): void {
        this.ioQueue.enqueue(op)

        if (!this.ioBlocked && this.ioInProgress === null) {
            this.processOps()
        }
    }

    processOps() {
        if (this.ioBlocked) {
            return
        }
        if (this.ioInProgress !== null) {
            return
        }
        this.ioInProgress = this.processOpsAsync().then(() => {
            this.ioInProgress = null
            if (this.ioQueue.opPending() && !this.ioBlocked) {
                setTimeout(() => {
                    this.processOps()
                }, 0)
            }
        })
    }

    async processOpsAsync(): Promise<void> {
        try {
            if (!this.ioQueue.opPending()) {
                return
            }
            const [readOps, writeOps] = this.ioQueue.getReady()
            await Promise.all([this.processReadOps(readOps), this.processWriteOps(writeOps)])
        } catch (err) {
            console.error(err)
        }
    }

    async processReadOps(ops: ReadIOOperation[]): Promise<void> {
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
            case IOOperationType.READ_ENTRIES:
                return this._processReadEntriesOp(op as ReadEntriesIOOperation, fh)
            case IOOperationType.READ_RANGE:
                return this._processReadRangeOp(op as ReadRangeIOOperation, fh)
            case IOOperationType.READ_CONFIG:
                return this._processReadConfigOp(op as ReadConfigIOOperation, fh)
            default:
                throw new Error("unknown IO op")
        }
    }

    async _processReadEntriesOp(op: ReadEntriesIOOperation, fh: FileHandle): Promise<void> {
        // TODO: combine adjacent reads
        const entryReads = await Promise.all(
            op.entryNums.map((entryNum) => this._processReadLogEntry(fh, op.logId!, ...op.index.entry(entryNum))),
        )
        op.entries = []
        for (const [entry, bytesRead] of entryReads) {
            op.bytesRead += bytesRead
            op.entries.push(entry)
        }
        op.complete(op)
    }

    async _processReadRangeOp(op: ReadRangeIOOperation, fh: FileHandle): Promise<void> {
        throw new Error("not implemented")
    }

    async _processReadHeadOp(op: ReadHeadIOOperation, fh: FileHandle): Promise<void> {
        const [entry, bytesRead] = await this._processReadLogEntry(fh, op.logId!, ...op.index.lastEntry())
        op.entry = entry
        op.bytesRead = bytesRead
        op.complete(op)
    }

    async _processReadConfigOp(op: ReadConfigIOOperation, fh: FileHandle): Promise<void> {
        const [entry, bytesRead] = await this._processReadLogEntry(fh, op.logId!, ...op.index.lastConfig())
        op.entry = entry
        op.bytesRead = bytesRead
        op.complete(op)
    }

    async _processReadLogEntry(
        fh: FileHandle,
        logId: LogId,
        entryNum: number,
        offset: number,
        length: number,
    ): Promise<[GlobalLogEntry | LogLogEntry, number]> {
        throw new Error("not implemented")
    }

    async processWriteOps(ops: WriteIOOperation[]): Promise<void> {
        throw new Error("not implemented")
    }

    /**
     * this is a fundamentally dangerous operation. it is needed to recover from failed log compactions
     * but it could easily lead to data loss in the case of bugs. for this reason it copies the truncated
     * data to a backup file before truncating. TODO: add chained CRC to log entries that also allows
     * verification that all entries exist in the correct order?
     *
     * this should only be called when writes are already blocked.
     */
    async truncate(byteLength: number): Promise<void> {
        if (byteLength < 1) {
            throw new Error(`trucate called with ${byteLength}`)
        }
        await this.closeAllFHs()
        // open file handles to copy data to be truncated
        const srcFH = await fs.open(this.logFile, "r")
        const dstFH = await fs.open(`${this.logFile}.truncated.${Date.now()}`, "w")
        // start reading after truncation location
        let offset = byteLength
        // read in 16kb blocks
        const readBytes = 1024 * 16
        const u8 = new Uint8Array(readBytes)
        // copy data to be truncated
        while (true) {
            const { bytesRead } = await srcFH.read(u8, { position: offset, length: readBytes })
            await dstFH.write(new Uint8Array(u8.buffer, u8.byteOffset, bytesRead))
            offset += bytesRead
            // end of file
            if (bytesRead < readBytes) {
                break
            }
        }
        // close copy file handles
        await srcFH.close()
        await dstFH.close()
        // truncate file
        await fs.truncate(this.logFile, byteLength)
    }

    async init(
        logEntryFactory: typeof GlobalLogEntryFactory | typeof LogLogEntryFactory,
        checkpontInterval: number,
    ): Promise<void> {
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
            let lastU8 = new Uint8Array(checkpontInterval)
            let currU8 = new Uint8Array(checkpontInterval)
            // bytes read from file
            let bytesRead = 0

            while (true) {
                const ret = await fh.read(currU8, { length: checkpontInterval })
                // bytes read from current buffer
                let u8BytesRead = 0
                // reads are aligned to checkpoint interval so every read after the first must start with checkpoint
                if (bytesRead >= checkpontInterval) {
                    let checkpoint
                    try {
                        checkpoint = GlobalLogCheckpoint.fromU8(currU8)
                    } catch (err) {
                        throw new Error(`Error parsing checkpoint at ${bytesRead}: ${err}`)
                    }
                    if (!checkpoint.verify()) {
                        throw new Error(`Error verifying checkpoint at ${bytesRead}`)
                    }
                    if (checkpoint.lastEntryOffset < 0) {
                        throw new Error(`Error parsing checkpoint at ${bytesRead}: lastEntryOffset < 0`)
                    }
                    // add length of checkpoint to bytes read from current buffer
                    u8BytesRead += checkpoint.byteLength()
                    // last entry is on either side of checkpoint and must be combined
                    if (checkpoint.lastEntryOffset !== 0) {
                        const lastEntryU8 = Buffer.concat([
                            new Uint8Array(
                                lastU8!.buffer,
                                lastU8!.byteOffset + lastU8!.byteLength - checkpoint.lastEntryOffset,
                                checkpoint.lastEntryOffset,
                            ),
                            new Uint8Array(
                                currU8.buffer,
                                currU8.byteOffset + u8BytesRead,
                                checkpoint.lastEntryLength - checkpoint.lastEntryOffset,
                            ),
                        ])
                        const res = logEntryFactory.fromPartialU8(lastEntryU8)
                        if (res.entry) {
                            const entry = res.entry
                            // entry offset from beginning of file is bytesRead from file minus lastEntryOffset from the checkpoint
                            const entryOffset = bytesRead - checkpoint.lastEntryOffset
                            if (entry instanceof LogLogEntry) {
                                this.initLogLogEntry(entry, entryOffset)
                            } else {
                                this.initGlobalLogEntry(entry, entryOffset)
                            }
                            // add the length of the end part of entry to bytes read from current buffer
                            u8BytesRead += checkpoint.lastEntryLength - checkpoint.lastEntryOffset
                        } else {
                            if (res.err) {
                                throw res.err
                            }
                            if (res.needBytes) {
                                throw new Error(`Error getting entry at checkpoint needBytes=${res.needBytes}`)
                            }
                        }
                    }
                }

                while (u8BytesRead < ret.bytesRead) {
                    const res = logEntryFactory.fromPartialU8(
                        new Uint8Array(currU8.buffer, currU8.byteOffset + u8BytesRead, ret.bytesRead - u8BytesRead),
                    )
                    if (res.err) {
                        throw new Error(`${res.err.message} at offset ${bytesRead + u8BytesRead}`)
                    } else if (res.needBytes) {
                        // swap last and curr buffers - on next iteration new data is read into old last and last is the old curr
                        const oldLastU8 = lastU8
                        lastU8 = currU8
                        currU8 = oldLastU8
                        break
                    }
                    const entry = res.entry
                    const entryOffset = bytesRead + u8BytesRead
                    if (entry instanceof LogLogEntry) {
                        this.initLogLogEntry(entry, entryOffset)
                    } else {
                        this.initGlobalLogEntry(entry as GlobalLogEntry, entryOffset)
                    }
                    u8BytesRead += entry!.byteLength()
                    // if entry ended exactly at the end of buffer then swap buffers
                    if (u8BytesRead === ret.bytesRead) {
                        const oldLastU8 = lastU8
                        lastU8 = currU8
                        currU8 = oldLastU8
                    }
                }

                bytesRead += ret.bytesRead
                // if we did not read requested bytes then end of file reached
                if (ret.bytesRead < checkpontInterval) {
                    if (u8BytesRead !== ret.bytesRead) {
                        console.error(
                            `u8BytesRead=${u8BytesRead}, bytesRead=${bytesRead}, ret.bytesRead=${ret.bytesRead}`,
                        )
                        throw new Error("reached end of file but did not read all bytes")
                    }
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

    initLogLogEntry(entry: LogLogEntry, entryOffset: number) {
        throw new Error("not implemented")
    }

    initGlobalLogEntry(entry: GlobalLogEntry, entryOffset: number) {
        throw new Error("not implemented")
    }
}
