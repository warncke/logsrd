import fs, { FileHandle } from "node:fs/promises"

import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import GlobalLogCheckpoint from "../entry/global-log-checkpoint"
import GlobalLogEntry, { PREFIX_BYTE_LENGTH } from "../entry/global-log-entry"
import { GLOBAL_LOG_CHECKPOINT_INTERVAL } from "../globals"
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
        let lastU8: Uint8Array | null = null
        let currU8 = new Uint8Array(GLOBAL_LOG_CHECKPOINT_INTERVAL)
        // bytes read from file
        let bytesRead = 0

        while (true) {
            const ret = await fh.read(currU8)
            // bytes read from current buffer
            let u8BytesRead = 0
            // reads are aligned to checkpoint interval so every read after the first must start with checkpoint
            if (bytesRead > GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                const checkpoint = GlobalLogCheckpoint.fromU8(currU8) as GlobalLogCheckpoint
                u8BytesRead += checkpoint.byteLength()
                const lastEntryLength = checkpoint.lastEntryLengthValue()
                const lastEntryOffset = checkpoint.lastEntryOffsetValue()
                // if the last entry did not end on checkpoint boundary then need to combine from last and curr
                if (lastEntryOffset !== lastEntryLength) {
                    const lastEntryU8 = Buffer.concat([
                        new Uint8Array(lastU8!.buffer, lastU8!.byteLength - lastEntryLength),
                        new Uint8Array(currU8.buffer, 0, lastEntryOffset),
                    ])
                    const res = GlobalLogEntry.fromPartialU8(lastEntryU8)
                    if (res.err) {
                        throw res.err
                    } else if (res.needBytes) {
                        throw new Error("Error getting entry from checkpoint boundary")
                    }
                    const entry = res.entry as GlobalLogEntry
                    const entryOffset = bytesRead - lastEntryOffset + PREFIX_BYTE_LENGTH
                    GlobalLogReader.addEntryToLog(log, entry, entryOffset)
                    u8BytesRead += entry.byteLength()
                }
            }

            while (u8BytesRead < ret.bytesRead) {
                const res = GlobalLogEntry.fromPartialU8(
                    new Uint8Array(currU8.buffer, currU8.byteOffset + u8BytesRead, currU8.byteLength - u8BytesRead),
                )
                if (res.err) {
                    throw res.err
                } else if (res.needBytes) {
                    // swap last and curr buffers - on next iteration new data is read into old last and last is the old curr
                    ;[lastU8] = [currU8]
                    break
                }
                const entry = res.entry as GlobalLogEntry
                const entryOffset = bytesRead + u8BytesRead + PREFIX_BYTE_LENGTH
                GlobalLogReader.addEntryToLog(log, entry, entryOffset)
                u8BytesRead += entry.byteLength()
            }

            bytesRead += ret.bytesRead
            // if we did not read requested bytes then end of file reached
            if (ret.bytesRead < GLOBAL_LOG_CHECKPOINT_INTERVAL) {
                break
            }
        }

        console.log(log.index)

        log.byteLength = bytesRead
    }

    static addEntryToLog(log: GlobalLog, entry: GlobalLogEntry, entryOffset: number): void {
        if (!entry.verify()) {
            // TODO: error handling
            console.error("cksum verification failed")
        }
        // create/get log index for this logId
        if (!log.index.has(entry.logId.base64())) {
            log.index.set(entry.logId.base64(), {
                en: [],
                cm: [],
                lc: [],
            })
        }
        const logIndex = log.index.get(entry.logId.base64())!
        // add entry to the correct index
        if (entry.entry instanceof CreateLogCommand || entry.entry instanceof SetConfigCommand) {
            logIndex.lc[0] = entryOffset
            logIndex.lc[1] = entry.entry.byteLength()
        } else if (entry.entry instanceof CommandLogEntry) {
            logIndex.cm.push(entryOffset, entry.entry.byteLength())
        } else {
            logIndex.en.push(entryOffset, entry.entry.byteLength())
        }
    }
}
