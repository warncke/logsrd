import { crc32 } from "@node-rs/crc32"

import LogEntry from "../log-entry"
import { EntryType } from "../types"

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

    crc32(): Uint8Array {
        return new Uint8Array(
            new Uint32Array([crc32(this.u8, crc32(TYPE_BYTE))]).buffer,
        )
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.u8]
    }

    static fromU8(u8: Uint8Array): BinaryLogEntry {
        return new BinaryLogEntry(u8)
    }
}
