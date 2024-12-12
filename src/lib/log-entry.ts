import BinaryLogEntry from './entry/binary-log-entry'
import CommandLogEntry from './entry/command-log-entry';
import JSONLogEntry from './entry/json-log-entry';

/**
 * Every LogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the entry type.
 * 
 * Log entries do not include the length bytes that are used to frame the entry when writing
 * to the log (see persist.ts).
 * 
 */

export enum EntryType {
    COMMAND,
    BINARY,
    JSON,
}

type ENTRY_TYPE_CLASSES =
    typeof CommandLogEntry  |
    typeof BinaryLogEntry   | 
    typeof JSONLogEntry

const ENTRY_CLASS: { [index: number]: ENTRY_TYPE_CLASSES} = {
    [EntryType.COMMAND]: CommandLogEntry,
    [EntryType.BINARY]: BinaryLogEntry,
    [EntryType.JSON]: JSONLogEntry,
}

export default class LogEntry {
    constructor() {
    }

    static fromU8(u8: Uint8Array): LogEntry {
        const entryType: number|undefined = u8.at(0);

        if (entryType === undefined || !(entryType in ENTRY_CLASS)) {
            throw new Error(`Invalid entryType: ${entryType}`);
        }
        else {
            return ENTRY_CLASS[entryType].fromU8(
                // create new Entry of correct class from the buffer minus the first byte
                new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1)
            )
        }
    }
}
