import { crc32 } from "@node-rs/crc32"

import { EntryType } from "../globals"
import LogEntry from "../log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG_CHECKPOINT])

export default class GlobalLogCheckpoint extends LogEntry {
    lastEntryOffset: Uint8Array
    lastEntryLength: Uint8Array
    crc32: Uint8Array | null

    /**
     * GlobalLogCheckpoint
     *
     * lastEntryOffset is a u16 that is the negative offset of the beginning of the last entry
     * from the checkpoint and lastEntryLength is a u16 that is the length of the last entry.
     *
     */
    constructor({
        lastEntryOffset,
        lastEntryLength,
        crc32,
    }: {
        lastEntryOffset: Uint8Array | number
        lastEntryLength: Uint8Array | number
        crc32?: Uint8Array | number
    }) {
        super()
        this.lastEntryOffset =
            typeof lastEntryOffset === "number"
                ? new Uint8Array(new Uint16Array([lastEntryOffset]).buffer)
                : lastEntryOffset
        this.lastEntryLength =
            typeof lastEntryLength === "number"
                ? new Uint8Array(new Uint16Array([lastEntryLength]).buffer)
                : lastEntryLength
        if (crc32 !== undefined) {
            this.crc32 = typeof crc32 === "number" ? new Uint8Array(new Uint32Array([crc32]).buffer) : crc32
        } else {
            this.crc32 = null
        }
    }

    lastEntryOffsetValue(): number {
        return new Uint16Array(this.lastEntryOffset.buffer)[0]
    }

    lastEntryLengthValue(): number {
        return new Uint16Array(this.lastEntryLength.buffer)[0]
    }

    cksum(): Uint8Array {
        return new Uint8Array(
            new Uint32Array([crc32(this.lastEntryOffset, crc32(this.lastEntryLength, crc32(TYPE_BYTE)))]).buffer,
        )
    }

    verify(): boolean {
        return this.crc32 === null ? false : new Uint32Array(this.crc32)[0] === new Uint32Array(this.cksum())[0]
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.lastEntryOffset, this.lastEntryLength, this.cksum()]
    }

    fromU8(u8: Uint8Array): GlobalLogCheckpoint {
        return new GlobalLogCheckpoint({
            lastEntryOffset: new Uint8Array(u8.buffer.slice(u8.byteOffset, u8.byteOffset + 2)),
            lastEntryLength: new Uint8Array(u8.buffer.slice(u8.byteOffset + 2, u8.byteOffset + 4)),
            crc32: new Uint8Array(u8.buffer.slice(u8.byteOffset + 4, u8.byteOffset + 8)),
        })
    }
}
