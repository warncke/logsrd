import LogEntry, { EntryType } from "../log-entry";

const TYPE_BYTE = new Uint8Array([EntryType.BINARY])

export default class BinaryLogEntry extends LogEntry {
    u8: Uint8Array

    constructor(u8: Uint8Array) {
        super()
        this.u8 = u8
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + u8.byteLength
        return 1 + this.u8.byteLength
    }

    u8s(): Uint8Array[] {
        return [ TYPE_BYTE, this.u8 ]
    }

    static fromU8(u8: Uint8Array): BinaryLogEntry {
        return new BinaryLogEntry(u8)
    }
}