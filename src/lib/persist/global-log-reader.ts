import fs, { FileHandle } from "node:fs/promises"

import GlobalLogEntry from "../entry/global-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL } from "../globals"
import LogId from "../log-id"
import GlobalLog from "./global-log"

export default class GlobalLogReader {
    static async initGlobal(log: GlobalLog): Promise<void> {
        // this should only be run at startup so these should always be null
        if (log.fh !== null || log.readBlocked !== null || log.writeBlocked !== null) {
            throw new Error("Error starting initGlobal")
        }
        // create promise to block reads/writes on log while this runs
        // this should not really be necessary
        const promise = new Promise<void>((resolve, reject) => {
            GlobalLogReader._initGlobal(log)
                .then(() => {
                    // clear blockers when done
                    log.unblockRead()
                    log.unblockWrite()
                    resolve()
                })
                .catch(reject)
        })
        log.readBlocked = promise
        log.writeBlocked = promise

        return promise
    }

    static async _initGlobal(log: GlobalLog): Promise<void> {
        let fh: FileHandle | null = null
        try {
            fh = await fs.open(log.logFile, "r")
            await GlobalLogReader.__initGlobal(log, fh)
        } catch (err: any) {
            // ignore if file does not exist - it will be created on open for write
            if (err.code !== "ENOENT") {
                throw err
            }
        } finally {
            if (fh !== null) {
                await fh.close()
            }
        }
    }

    static async __initGlobal(log: GlobalLog, fh: FileHandle): Promise<void> {
        const lastU8: Uint8Array | null = null
        const currU8 = new Uint8Array(GLOBAL_LOG_CHECKPOINT_INTERVAL)
        // track offset with the file to get total offset from the buffer offset
        let fileOffset = 0
        // keep track of read offset on current buffer
        let u8Offset = 0
        // length of file at end
        let totalBytesRead = 0

        while (true) {
            const ret = await fh.read(currU8)
            totalBytesRead += ret.bytesRead
            // at the beginning of every checkpoint interval aligned read after
            // the first the first entry must be a checkpoint
            if (fileOffset > GLOBAL_LOG_CHECKPOINT_INTERVAL) {
            }

            while (u8Offset < ret.bytesRead) {
                const res = GlobalLogEntry.fromPartialU8(
                    new Uint8Array(currU8.buffer, currU8.byteOffset + u8Offset, currU8.byteLength - u8Offset),
                )
                if (res.err) {
                    throw res.err
                }
            }

            if (ret.bytesRead < GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                break
            }
        }

        log.byteLength = currU8.byteLength
    }
}
