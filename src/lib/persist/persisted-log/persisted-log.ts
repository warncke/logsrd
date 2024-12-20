import fs, { FileHandle } from "node:fs/promises"

import { IOOperationType, PersistLogArgs, ReadIOOperation } from "../../globals"
import LogConfig from "../../log-config"
import Persist from "../../persist"
import GlobalLogIOQueue from "../io/global-log-io-queue"
import IOOperation from "../io/io-operation"
import IOQueue from "../io/io-queue"
import ReadConfigIOOperation from "../io/read-config-io-operation"
import ReadHeadIOOperation from "../io/read-head-io-operation"
import ReadRangeIOOperation from "../io/read-range-io-operation"
import WriteIOOperation from "../io/write-io-operation"

export default class PersistedLog {
    config: LogConfig
    logFile: string
    persist: Persist
    ioQueue: GlobalLogIOQueue | IOQueue = new IOQueue()
    writeFH: FileHandle | null = null
    freeReadFhs: Array<FileHandle> = []
    maxReadFHs: number = 1
    openReadFhs: number = 0
    byteLength: number = 0
    ioBlocked: boolean = false
    ioInProgress: Promise<void> | null = null
    isColdLog: boolean = false
    isOldHotLog: boolean = false
    isNewHotLog: boolean = false

    constructor({
        config,
        logFile,
        persist,
        isColdLog = false,
        isNewHotLog = false,
        isOldHotLog = false,
    }: PersistLogArgs) {
        this.config = config
        this.logFile = logFile
        this.persist = persist
        this.isColdLog = isColdLog
        this.isNewHotLog = isNewHotLog
        this.isOldHotLog = isOldHotLog
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

    async closeAllFHs(): Promise<void> {
        await Promise.all([Promise.all(this.freeReadFhs.map((fh) => fh.close())), this.closeWriteFH()])
    }

    getReadFH(): FileHandle | null {
        if (this.freeReadFhs.length > 0) {
            return this.freeReadFhs.pop()!
        }
        // TODO: add global limit
        if (this.openReadFhs < this.maxReadFHs) {
            // increment open here because it needs to be synchronous
            this.openReadFhs += 1
            fs.open(this.logFile, "r")
                .then((fh) => {
                    this.freeReadFhs.push(fh)
                })
                .catch((err) => {
                    this.openReadFhs -= 1
                    console.error(err)
                })
        }
        return null
    }

    closeReadFH(fh: FileHandle): void {
        fh.close()
            .then(() => {
                this.openReadFhs -= 1
            })
            .catch((err) => {
                console.error(err)
                this.openReadFhs -= 1
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
            case IOOperationType.READ_RANGE:
                return this._processReadRangeOp(op as ReadRangeIOOperation, fh)
            case IOOperationType.READ_CONFIG:
                return this._processReadConfigOp(op as ReadConfigIOOperation, fh)
            default:
                throw new Error("unknown IO op")
        }
    }

    async _processReadRangeOp(op: ReadRangeIOOperation, fh: FileHandle): Promise<void> {
        throw new Error("not implemented")
    }

    async _processReadHeadOp(op: ReadHeadIOOperation, fh: FileHandle): Promise<void> {
        throw new Error("not implemented")
    }

    async _processReadConfigOp(op: ReadConfigIOOperation, fh: FileHandle): Promise<void> {
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
        await this.closeWriteFH()
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
}
