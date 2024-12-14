import { EntryType, Writable } from "../globals"
import LogEntry from "../log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.LOG_LOG])

export default class GlobalLogEntry extends LogEntry {
    entry: Writable

    constructor({ entry }: { entry: Writable }) {
        super()
        this.entry = entry
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 2 byte length + entry bytes... + 4 byte checksum
        return 1 + 2 + this.entry.byteLength() + 4
    }

    u8s(): Uint8Array[] {
        return [
            TYPE_BYTE,
            new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer),
            this.entry.cksum(),
            ...this.entry.u8s(),
        ]
    }
}
