import { crc32 } from "@node-rs/crc32"

import { EntryType, GLOBAL_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import LogId from "../log-id"
import LogEntry from "./log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG])

export default class GlobalLogEntry extends LogEntry {
    entryNum: number
    logId: LogId
    entry: LogEntry
    crc: Number | null
    #prefixU8: Uint8Array | null = null

    constructor({ entryNum, logId, entry, crc }: { entryNum: number; logId: LogId; entry: LogEntry; crc?: Number }) {
        super()
        this.entryNum = entryNum
        this.logId = logId
        this.entry = entry
        this.crc = crc ? crc : null
    }

    byteLength(): number {
        return GLOBAL_LOG_PREFIX_BYTE_LENGTH + this.entry.byteLength()
    }

    cksum(): number {
        if (this.cksumNum === 0) {
            this.cksumNum = this.entry.cksum(this.entryNum)
        }
        return this.cksumNum
    }

    prefixU8(): Uint8Array {
        if (this.#prefixU8 !== null) {
            return this.#prefixU8
        }
        this.#prefixU8 = new Uint8Array(GLOBAL_LOG_PREFIX_BYTE_LENGTH)
        this.#prefixU8.set(TYPE_BYTE)
        this.#prefixU8.set(this.logId.logId, 1)
        this.#prefixU8.set(new Uint8Array(new Uint32Array([this.entryNum]).buffer), 17)
        this.#prefixU8.set(new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer), 21)
        this.#prefixU8.set(new Uint8Array(new Uint32Array([this.cksum()]).buffer), 23)
        return this.#prefixU8
    }

    u8s(): Uint8Array[] {
        return [this.prefixU8(), ...this.entry.u8s()]
    }

    verify(): boolean {
        return this.crc === null ? false : this.crc === this.cksum()
    }
}
