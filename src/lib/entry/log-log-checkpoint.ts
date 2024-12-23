import { crc32 } from "@node-rs/crc32"

import { EntryType, LOG_LOG_CHECKPOINT_BYTE_LENGTH } from "../globals"
import LogEntry from "./log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.LOG_LOG_CHECKPOINT])

export default class LogLogCheckpoint extends LogEntry {
    lastEntryOffset: number
    lastEntryLength: number
    lastConfigOffset: number
    crc: number | null
    #entryU8: Uint8Array | null = null

    /**
     * LogLogCheckpoint
     *
     * lastEntryOffset is a u16 that is the negative offset of the beginning of the last entry
     * from the checkpoint and lastEntryLength is a u16 that is the length of the last entry.
     * lastConfigOffset is a u32 that is the offset of the last config entry from beginning of file
     *
     */
    constructor({
        lastEntryOffset,
        lastEntryLength,
        lastConfigOffset,
        crc,
    }: {
        lastEntryOffset: number
        lastEntryLength: number
        lastConfigOffset: number
        crc?: number
    }) {
        super()
        this.lastEntryOffset = lastEntryOffset
        this.lastEntryLength = lastEntryLength
        this.lastConfigOffset = lastConfigOffset
        this.crc = crc === undefined ? null : crc
    }

    byteLength(): number {
        return LOG_LOG_CHECKPOINT_BYTE_LENGTH
    }

    cksum(entryNum: number = 0): number {
        if (this.cksumNum === 0) {
            this.cksumNum = crc32(this.u8())
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
        this.#entryU8 = new Uint8Array(9)
        this.#entryU8.set(TYPE_BYTE)
        this.#entryU8.set(new Uint8Array(new Uint16Array([this.lastEntryOffset]).buffer), 1)
        this.#entryU8.set(new Uint8Array(new Uint16Array([this.lastEntryLength]).buffer), 3)
        this.#entryU8.set(new Uint8Array(new Uint32Array([this.lastConfigOffset]).buffer), 5)
        return this.#entryU8
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.u8(), new Uint8Array(new Uint32Array([this.cksum()]).buffer)]
    }

    fromU8(u8: Uint8Array): LogLogCheckpoint {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.LOG_LOG_CHECKPOINT) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new LogLogCheckpoint({
            lastEntryOffset: new Uint16Array(u8.buffer.slice(u8.byteOffset + 1, u8.byteOffset + 3))[0],
            lastEntryLength: new Uint16Array(u8.buffer.slice(u8.byteOffset + 3, u8.byteOffset + 5))[0],
            lastConfigOffset: new Uint32Array(u8.buffer.slice(u8.byteOffset + 5, u8.byteOffset + 9))[0],
            crc: new Uint32Array(u8.buffer.slice(u8.byteOffset + 9, u8.byteOffset + 13))[0],
        })
    }
}
