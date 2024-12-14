import { crc32 } from "@node-rs/crc32"

import LogEntry from "../log-entry"
import { EntryType } from "../types"

const TYPE_BYTE = new Uint8Array([EntryType.JSON])

export default class JSONLogEntry extends LogEntry {
    #jsonStr: string | null = null
    #jsonU8: Uint8Array | null = null

    constructor({
        jsonStr,
        jsonU8,
    }: {
        jsonStr?: string | null
        jsonU8?: Uint8Array | null
    }) {
        super()
        if (jsonStr) {
            this.#jsonStr = jsonStr
        } else if (jsonU8) {
            this.#jsonU8 = jsonU8
        } else {
            throw new Error("Must provide jsonStr or jsonU8")
        }
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + json.length
        return 1 + this.jsonU8().byteLength
    }

    crc32(): Uint8Array {
        return new Uint8Array(
            new Uint32Array([crc32(this.jsonU8(), crc32(TYPE_BYTE))]).buffer,
        )
    }

    jsonU8(): Uint8Array {
        if (this.#jsonU8 !== null) {
            return this.#jsonU8
        } else if (this.#jsonStr !== null) {
            this.#jsonU8 = new TextEncoder().encode(this.#jsonStr)
            return this.#jsonU8
        } else {
            throw new Error("No json")
        }
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.jsonU8()]
    }

    static fromU8(u8: Uint8Array): JSONLogEntry {
        return new JSONLogEntry({
            jsonU8: u8,
        })
    }
}
