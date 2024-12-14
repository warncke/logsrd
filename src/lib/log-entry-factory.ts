import BinaryLogEntry from "./entry/binary-log-entry"
import CommandLogEntry from "./entry/command-log-entry"
import CommandLogEntryFactory from "./entry/command-log-entry-factory"
import JSONLogEntry from "./entry/json-log-entry"
import LogEntry from "./log-entry"
import { EntryType } from "./types"

type ENTRY_TYPE_CLASSES =
    | typeof CommandLogEntry
    | typeof BinaryLogEntry
    | typeof JSONLogEntry

const ENTRY_CLASS: { [index: number]: ENTRY_TYPE_CLASSES } = {
    [EntryType.COMMAND]: CommandLogEntry,
    [EntryType.BINARY]: BinaryLogEntry,
    [EntryType.JSON]: JSONLogEntry,
}

class LogEntryFactory {
    static fromU8(u8: Uint8Array): LogEntry {
        const entryType: number | undefined = u8.at(0)

        if (entryType === undefined || !(entryType in ENTRY_CLASS)) {
            throw new Error(`Invalid entryType: ${entryType}`)
        } else {
            if (entryType === EntryType.COMMAND) {
                return CommandLogEntryFactory.fromU8(u8)
            } else {
                return ENTRY_CLASS[entryType].fromU8(
                    // create new Entry of correct class from the buffer minus the first byte
                    new Uint8Array(
                        u8.buffer,
                        u8.byteOffset + 1,
                        u8.byteLength - 1,
                    ),
                )
            }
        }
    }
}
