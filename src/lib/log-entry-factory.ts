import CommandLogEntryFactory from "./entry/command-log-entry-factory"
import { ENTRY_CLASS, EntryType } from "./globals"
import LogEntry from "./log-entry"

export default class LogEntryFactory {
    static fromU8(u8: Uint8Array): LogEntry {
        const entryType: number | undefined = u8.at(0)

        if (entryType === undefined || !(entryType in ENTRY_CLASS)) {
            throw new Error(`Invalid entryType: ${entryType}`)
        } else {
            // create buffer of entry data minus the type byte
            const entryBuffer = new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1)
            if (entryType === EntryType.COMMAND) {
                return CommandLogEntryFactory.fromU8(entryBuffer)
            } else {
                return ENTRY_CLASS[entryType].fromU8(entryBuffer)
            }
        }
    }

    static fromPartialU8(u8: Uint8Array): {
        entry?: LogEntry | null
        needBytes?: number
        err?: Error
    } {
        if (u8.length < 1) {
            return { needBytes: 1 }
        }
        const entryType: number | undefined = u8.at(0)
        // should only be used with log entry types that have their length as part of their data
        if (entryType === EntryType.GLOBAL_LOG || entryType === EntryType.LOG_LOG) {
            // create buffer of entry data minus the type byte
            const entryBuffer = new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1)
            return ENTRY_CLASS[entryType].fromPartialU8(entryBuffer)
        } else {
            return { err: new Error(`Invalid entryType: ${entryType}`) }
        }
    }
}
