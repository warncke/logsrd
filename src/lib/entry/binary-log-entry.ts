import { crc32 } from "@node-rs/crc32"

import { EntryType } from "../globals"
import LogEntry from "../log-entry"

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

    cksum(entryNum: number): number {
        if (this.cksumNum === 0) {
            this.cksumNum = crc32(this.u8, crc32(TYPE_BYTE, entryNum))
        }
        return this.cksumNum
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.u8]
    }

    static fromU8(u8: Uint8Array): BinaryLogEntry {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.BINARY) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new BinaryLogEntry(new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1))
    }
}
