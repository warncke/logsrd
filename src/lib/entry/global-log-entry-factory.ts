import { EntryType, GLOBAL_LOG_PREFIX_BYTE_LENGTH, MAX_ENTRY_SIZE } from "../globals"
import LogId from "../log-id"
import GlobalLogEntry from "./global-log-entry"
import LogEntry from "./log-entry"
import LogEntryFactory from "./log-entry-factory"
import LogLogEntry from "./log-log-entry"
import LogLogEntryFactory from "./log-log-entry-factory"

export default class GlobalLogEntryFactory {
    /**
     * Must be called with u8 that is known to contain a complete GlobalLogEntry
     */
    static fromU8(u8: Uint8Array): GlobalLogEntry {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.GLOBAL_LOG) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new GlobalLogEntry(GlobalLogEntryFactory.globalLogEntryArgsFromU8(u8))
    }

    /**
     * Can be called with any u8 from a hot or cold global log that begins with either
     * a GlobalLogEntry or a LogLogEntry. This is needed because the global log stores
     * its own commands as LogLog entries.
     */
    static fromPartialU8(u8: Uint8Array): {
        entry?: LogLogEntry | GlobalLogEntry | null
        needBytes?: number
        err?: Error
    } {
        if (u8.length < GLOBAL_LOG_PREFIX_BYTE_LENGTH) {
            return { needBytes: GLOBAL_LOG_PREFIX_BYTE_LENGTH - u8.length }
        }

        const entryType: number | undefined = u8.at(0)
        if (entryType === EntryType.GLOBAL_LOG) {
            const entryLength = GlobalLogEntryFactory.entryLengthFromU8(u8)
            if (entryLength > MAX_ENTRY_SIZE) {
                return { err: new Error(`Invalid entryLength: ${entryLength}`) }
            }
            const totalLength = entryLength + GLOBAL_LOG_PREFIX_BYTE_LENGTH
            if (u8.length < totalLength) {
                return { needBytes: totalLength - u8.length }
            }
            try {
                return { entry: new GlobalLogEntry(GlobalLogEntryFactory.globalLogEntryArgsFromU8(u8)) }
            } catch (err: any) {
                return { err }
            }
        } else if (entryType === EntryType.LOG_LOG) {
            try {
                return LogLogEntryFactory.fromPartialU8(u8)
            } catch (err: any) {
                return { err }
            }
        } else {
            return { err: new Error(`Invalid entryType: ${entryType}`) }
        }
    }

    static entryLengthFromU8(u8: Uint8Array): number {
        return new Uint16Array(u8.buffer.slice(u8.byteOffset + 21, u8.byteOffset + 23))[0]
    }

    static globalLogEntryArgsFromU8(u8: Uint8Array): {
        logId: LogId
        entryNum: number
        crc: number
        entry: LogEntry
    } {
        const entryLength = GlobalLogEntryFactory.entryLengthFromU8(u8)
        const logId = new LogId(new Uint8Array(u8.buffer, u8.byteOffset + 1, 16))
        const entryNum = new Uint32Array(u8.buffer.slice(u8.byteOffset + 17, u8.byteOffset + 21))[0]
        const crc = new Uint32Array(u8.buffer.slice(u8.byteOffset + 23, u8.byteOffset + 27))[0]
        const entry = LogEntryFactory.fromU8(
            new Uint8Array(u8.buffer, u8.byteOffset + GLOBAL_LOG_PREFIX_BYTE_LENGTH, entryLength),
        )

        return { logId, entryNum, crc, entry }
    }
}
