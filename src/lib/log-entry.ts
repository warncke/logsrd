import Binary from './entry/binary'
import Command from './entry/command';
import JSON from './entry/json';

/**
 * Every LogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the entry type.
 * 
 * Log entries do not include the length bytes that are used to frame the entry when writing
 * to the log (see persist.ts).
 * 
 */

enum EntryType {
    COMMAND,
    BINARY,
    JSON,
}

type ENTRY_TYPE_CLASSES =
    typeof Command  |
    typeof Binary   | 
    typeof JSON

const ENTRY_CLASS: { [K in EntryType]: ENTRY_TYPE_CLASSES} = {
    [EntryType.COMMAND]: Command,
    [EntryType.BINARY]: Binary,
    [EntryType.JSON]: JSON,
}

export default class LogEntry {
    constructor() {
    }

    fromDataView(dataView: DataView) {
        const entryType: EntryType = dataView.getUint8(0);

        if (!ENTRY_CLASS[entryType]) {
            throw new Error(`Invalid entryType: ${entryType}`);
        }

        return ENTRY_CLASS[entryType].fromDataView(dataView);
    }
}
