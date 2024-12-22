import { crc32 } from "@node-rs/crc32"

import { EntryType } from "../globals"
import LogEntry from "./log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG_CHECKPOINT])

export default class GlobalLogCheckpoint extends LogEntry {
    lastEntryOffset: number
    lastEntryLength: number
    crc: number | null
    #entryU8: Uint8Array | null = null

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
        crc,
    }: {
        lastEntryOffset: number
        lastEntryLength: number
        crc?: number
    }) {
        super()
        this.lastEntryOffset = lastEntryOffset
        this.lastEntryLength = lastEntryLength
        this.crc = crc === undefined ? null : crc
    }

    byteLength(): number {
        // 1 byte type + 4 byte cksum + 2 byte lastEntryOffset + 2 byte lastEntryLength
        return 9
    }

    cksum(): number {
        if (this.cksumNum === 0) {
            this.cksumNum = crc32(this.u8(), crc32(TYPE_BYTE))
        }
        return this.cksumNum
    }

    verify(): boolean {
        return this.crc === null ? false : this.crc === this.cksum()
    }

    u8(): Uint8Array {
        if (this.#entryU8 !== null) {
            return this.#entryU8
        }
        this.#entryU8 = new Uint8Array(4)
        this.#entryU8.set(new Uint8Array(new Uint16Array([this.lastEntryOffset]).buffer))
        this.#entryU8.set(new Uint8Array(new Uint16Array([this.lastEntryLength]).buffer), 2)
        return this.#entryU8
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.u8(), new Uint8Array(new Uint32Array([this.cksum()]).buffer)]
    }

    static fromU8(u8: Uint8Array): GlobalLogCheckpoint {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.GLOBAL_LOG_CHECKPOINT) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new GlobalLogCheckpoint({
            lastEntryOffset: new Uint16Array(u8.buffer.slice(u8.byteOffset + 1, u8.byteOffset + 3))[0],
            lastEntryLength: new Uint16Array(u8.buffer.slice(u8.byteOffset + 3, u8.byteOffset + 5))[0],
            crc: new Uint32Array(u8.buffer.slice(u8.byteOffset + 5, u8.byteOffset + 9))[0],
        })
    }
}
