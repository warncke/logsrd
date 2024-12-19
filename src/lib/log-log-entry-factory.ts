import LogLogEntry from "./entry/log-log-entry"
import { EntryType, LOG_LOG_PREFIX_BYTE_LENGTH } from "./globals"
import LogEntry from "./log-entry"

export default class LogLogEntryFactory {
    static fromU8(u8: Uint8Array): LogLogEntry {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.LOG_LOG) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new LogLogEntry(LogLogEntryFactory.logLogArgsFromU8(u8))
    }

    static fromPartialU8(u8: Uint8Array): {
        entry?: LogLogEntry | null
        needBytes?: number
        err?: Error
    } {
        if (u8.length < LOG_LOG_PREFIX_BYTE_LENGTH) {
            return { needBytes: LOG_LOG_PREFIX_BYTE_LENGTH - u8.length }
        }

        const entryType: number | undefined = u8.at(0)
        if (entryType === EntryType.LOG_LOG) {
            // get entry length
            const entryLength = LogLogEntryFactory.entryLengthFromU8(u8)
            const totalLength = entryLength + LOG_LOG_PREFIX_BYTE_LENGTH
            if (u8.length < totalLength) {
                return { needBytes: totalLength - u8.length }
            }
            try {
                return { entry: new LogLogEntry(LogLogEntryFactory.logLogArgsFromU8(u8)) }
            } catch (err: any) {
                return { err }
            }
        } else {
            return { err: new Error(`Invalid entryType: ${entryType}`) }
        }
    }

    static entryLengthFromU8(u8: Uint8Array): number {
        return new Uint16Array(u8.buffer.slice(u8.byteOffset + 5, u8.byteOffset + 7))[0]
    }

    static logLogArgsFromU8(u8: Uint8Array): {
        entry: LogEntry
        entryNum: number
        crc: number
    } {
        const entryLength = LogLogEntryFactory.entryLengthFromU8(u8)
        const entryNum = new Uint32Array(u8.buffer.slice(u8.byteOffset + 1, u8.byteOffset + 5))[0]
        const crc = new Uint32Array(u8.buffer.slice(u8.byteOffset + 7, u8.byteOffset + 11))[0]
        const entry = LogLogEntryFactory.fromU8(
            new Uint8Array(u8.buffer, u8.byteOffset + LOG_LOG_PREFIX_BYTE_LENGTH, entryLength),
        )

        return { entry, entryNum, crc: crc }
    }
}
