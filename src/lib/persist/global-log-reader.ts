import fs, { FileHandle } from 'node:fs/promises'

import GlobalLog from './global-log'
import BeginWriteCommand from '../entry/command/begin-write-command'
import LogId from '../log-id'
import EndWriteCommand from '../entry/command/end-write-command'

// this runs at startup so no real concern about memory usage
// set this as high as needed to maximize throughput
const GLOBAL_READ_BUFFER_SIZE = 32

export default class GlobalLogReader {
    static async initGlobal(log: GlobalLog): Promise<void> {
        // this should only be run at startup so these should always be null
        if (log.fh !== null || log.readBlocked !== null || log.writeBlocked !== null) {
            throw new Error('Error starting initGlobal')
        }
        // create promise to block reads/writes on log while this runs
        // this should not really be necessary
        const promise = new Promise<void>((resolve, reject) => {
            GlobalLogReader._initGlobal(log).then(() => {
                // clear blockers when done
                log.unblockRead()
                log.unblockWrite()
                resolve()
            }).catch(reject)
        })
        log.readBlocked = promise
        log.writeBlocked = promise
        
        return promise
    }

    static async _initGlobal(log: GlobalLog): Promise<void> {
        let fh: FileHandle|null = null
        try {
            fh = await fs.open(log.logFile, 'r')
            await GlobalLogReader.__initGlobal(log, fh)
        }
        catch (err: any) {
            // ignore if file does not exist - it will be created on open for write
            if (err.code !== 'ENOENT') {
                throw err
            }
        }
        finally {
            if (fh !== null) {
                await fh.close()
            }
        }
    }

    static async __initGlobal(log: GlobalLog, fh: FileHandle): Promise<void> {
        // track offset with the file to get total offset from the buffer offset
        let fileOffset = 0
        // writes are combined with a begin and end write command around every
        // section of entries so we have to keep track of the last begin write
        // and only accept entries if the end write matches
        let lastBeginWriteOffset = 0
        let lastBeginWriteLength = 0
        let nextExpectedEndWrite = 0
        // when set to true next entry should be begin write
        let expectBeginWrite = true
        // array of pending entries that will be confirmed when end write is verified
        let pendingEntries: Array<LogId|number> = []
        // this is shit but i wrote the parsing in a stpuid way that makes it hard to
        // join across buffer segments and i am going to refactor the whole thing to
        // use log entries instead so doing it like this for now
        const currU8 = await fh.readFile()
        // keep track of read offset on current buffer
        let u8Offset = 0
        while (u8Offset < currU8.byteLength) {
            // log should always start with BeginWriteCommand
            if (expectBeginWrite) {
                const beginWrite = BeginWriteCommand.fromU8(new Uint8Array(currU8.buffer, u8Offset, BeginWriteCommand.expectedByteLength))
                lastBeginWriteOffset = fileOffset + u8Offset
                lastBeginWriteLength = beginWrite.value()
                nextExpectedEndWrite = lastBeginWriteOffset + lastBeginWriteLength + BeginWriteCommand.expectedByteLength
                u8Offset += BeginWriteCommand.expectedByteLength
                expectBeginWrite = false
            }
            // after begin write should be first entry starting with logId
            const logId = new LogId(new Uint8Array(currU8.buffer, u8Offset, 16))
            u8Offset += 16
            // next 2 bytes are the length of the log entry. use slice because
            // offset needs to be aligned to multiple of 2
            const entryLength = new Uint16Array(currU8.buffer.slice(u8Offset, u8Offset + 2))[0]
            u8Offset += 2
            // add logId, entry offset from start of file, and entry length to pending
            pendingEntries.push(logId, fileOffset + u8Offset, entryLength)
            // TOOD: add checksum verification
            // skip over entry data
            u8Offset += entryLength
            // length bytes are also written after entry
            const endEntryLength = new Uint16Array(currU8.buffer.slice(u8Offset, u8Offset + 2))[0]
            if (endEntryLength !== entryLength) {
                throw new Error(`Entry length mismatch at ${fileOffset + u8Offset}`)
            }
            u8Offset += 2
            // we have reached location where end write should be
            if (fileOffset + u8Offset === nextExpectedEndWrite) {
                // get end write command
                const endWrite = EndWriteCommand.fromU8(new Uint8Array(currU8.buffer, u8Offset, BeginWriteCommand.expectedByteLength))
                const endWriteLength = endWrite.value()
                // check that end write matches begin write
                if (endWriteLength !== lastBeginWriteLength) {
                    throw new Error(`End write length mismatch at ${fileOffset + u8Offset} expected: ${lastBeginWriteLength} actual: ${endWriteLength}`)
                }
                u8Offset += EndWriteCommand.expectedByteLength
                // add entry locations to index by logId
                for (let i = 0; i < pendingEntries.length; i += 3) {
                    const logId = pendingEntries[i] as LogId
                    const offset = pendingEntries[i + 1] as number
                    const length = pendingEntries[i + 2] as number
                    if (!log.index.has(logId.base64())) {
                        log.index.set(logId.base64(), [])
                    }
                    const index = log.index.get(logId.base64())!
                    index.push(offset, length)
                }
                // clear pending entries
                pendingEntries = []
                // next entry should be begin write
                expectBeginWrite = true
            }
            // if we have passed end write then need to truncate log after here
            else if (fileOffset + u8Offset > nextExpectedEndWrite) {
                // TODO: implement truncation?
                // this could be due to a real failed write or due to a bug and so log may
                // still contain data that was supposed to be committed. maybe add some other
                // failsafe mechanism or maybe begin and end write is not really needed if we
                // wrap this in a GlobalLogEntry? still a problem that if one write doesnt complete
                // if there are other writes after that you dont know where they start. need
                // to make sure nothing written after aborted write. but if bug exists then still
                // need to try to recover as much data as possible, so read from end maybe?
                throw new Error(`End write not found at ${fileOffset + u8Offset} expected ${nextExpectedEndWrite}`)
            }
        }

        if (pendingEntries.length > 0) {
            throw new Error('End write not found at end of file')
        }

        log.byteLength = currU8.byteLength
    }
}