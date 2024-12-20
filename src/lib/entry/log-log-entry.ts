import { EntryType, LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import LogEntry from "./log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.LOG_LOG])

export default class LogLogEntry extends LogEntry {
    entry: LogEntry
    entryNum: number
    crc: number | null
    #prefixU8: Uint8Array | null = null

    constructor({ entry, entryNum, crc }: { entry: LogEntry; entryNum: number; crc?: number }) {
        super()
        this.entry = entry
        this.entryNum = entryNum
        this.crc = crc === undefined ? null : crc
    }

    byteLength(): number {
        return LOG_LOG_PREFIX_BYTE_LENGTH + this.entry.byteLength()
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
        this.#prefixU8 = new Uint8Array(LOG_LOG_PREFIX_BYTE_LENGTH)
        this.#prefixU8.set(new Uint8Array(new Uint32Array([this.entryNum]).buffer))
        this.#prefixU8.set(new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer), 4)
        this.#prefixU8.set(new Uint8Array(new Uint32Array([this.cksum()]).buffer), 6)
        return this.#prefixU8
    }

    u8s(): Uint8Array[] {
        return [this.prefixU8(), ...this.entry.u8s()]
    }

    verify(): boolean {
        return this.crc === null ? false : this.crc === this.cksum()
    }
}
