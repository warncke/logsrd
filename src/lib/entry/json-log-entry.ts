import { crc32 } from "@node-rs/crc32"

import { EntryType } from "../globals"
import LogEntry from "./log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.JSON])

export default class JSONLogEntry extends LogEntry {
    #jsonStr: string | null = null
    #jsonU8: Uint8Array | null = null

    constructor({ jsonStr, jsonU8 }: { jsonStr?: string | null; jsonU8?: Uint8Array | null }) {
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
        return 1 + this.u8().byteLength
    }

    cksum(entryNum: number): number {
        if (this.cksumNum === 0) {
            this.cksumNum = crc32(this.u8(), crc32(TYPE_BYTE, entryNum))
        }
        return this.cksumNum
    }

    u8(): Uint8Array {
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
        return [TYPE_BYTE, this.u8()]
    }

    str(): string {
        if (this.#jsonStr !== null) {
            return this.#jsonStr
        } else if (this.#jsonU8 !== null) {
            this.#jsonStr = new TextDecoder().decode(this.#jsonU8)
            return this.#jsonStr
        } else {
            throw new Error("No json")
        }
    }

    static fromU8(u8: Uint8Array): JSONLogEntry {
        const entryType: number | undefined = u8.at(0)
        if (entryType !== EntryType.JSON) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        return new JSONLogEntry({
            jsonU8: new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1),
        })
    }
}
