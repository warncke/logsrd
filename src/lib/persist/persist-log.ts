import fs, { FileHandle } from "node:fs/promises"

import { PersistLogArgs } from "../globals"
import LogConfig from "../log-config"
import ReadQueue from "./read-queue"
import WriteQueue from "./write-queue"

// keep track of globally open read file handles
const openReadFHs = 0

export default class PersistLog {
    config: LogConfig
    // write file handle
    writeFH: FileHandle | null = null
    // read file handles
    freeReadFhs: Array<FileHandle> = []
    // should be overridden
    maxReadFHs: number = 1
    openReadFhs: number = 0
    // file name of log
    logFile: string
    // length of file. for global log files, where the entire file is read and
    // indexed before starting the server, this will initially be set by reading
    // all bytes from the file. for opening a log log file this is initially set
    // with stat and then the file is read backward from the end in most cases
    // to get the most recent entry. this will be updated internally on writes
    // with the bytes written.
    byteLength: number = 0
    // all writes are submitted to writeQueue. when writeQueueInProgress is null
    // writeQueue is moved to writeQueueInProgress and a new writeQueue is created.
    writeInProgress: WriteQueue | null = null
    writeQueue: WriteQueue
    // when writes need to be blocked by an operation, like finalizing compaction
    // of global logs, the operation sets the writeBocked promise here. if
    // writeInProgress is not null the blocking operation must wait for it to
    // complete before starting. after the blocking operation completes it must
    // move the writeQueue to in progress if it has any pending writes.
    writeBlocked: Promise<void> | null = null
    // read queues and blocking work the same way as for writing but they differ
    // in how they are handled (see implementation for details)
    readInProgress: ReadQueue | null = null
    readQueue: ReadQueue
    readBlocked: Promise<void> | null = null

    constructor({ config, logFile }: PersistLogArgs) {
        this.config = config
        this.logFile = logFile
        this.readQueue = new ReadQueue()
        this.writeQueue = new WriteQueue()
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

    async blockWrite(promise: Promise<void>): Promise<void> {
        // multiple callers may be waiting on writeBlocked - what happens???
        while (this.writeBlocked !== null) {
            await this.writeBlocked
        }
        this.writeBlocked = promise
            .catch((err) => {
                console.error(err)
            })
            .then(() => {
                this.writeBlocked = null
            })
    }

    unblockRead(): void {
        this.readBlocked = null
        // TODO: add method to process read queue
    }

    unblockWrite(): void {
        this.writeBlocked = null
        // TODO: add method to process write queue
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
