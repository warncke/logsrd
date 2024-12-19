import fs, { FileHandle } from "node:fs/promises"

import { PersistLogArgs } from "../../globals"
import LogConfig from "../../log-config"
import Persist from "../../persist"

export default class PersistedLog {
    config: LogConfig
    logFile: string
    persist: Persist
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
