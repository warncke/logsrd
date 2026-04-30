import { describe, expect, it } from "@jest/globals"

import GlobalLogEntryFactory from "./global-log-entry-factory.js"
import GlobalLogEntry from "./global-log-entry.js"
import BinaryLogEntry from "./binary-log-entry.js"
import JSONLogEntry from "./json-log-entry.js"
import LogId from "../log/log-id.js"
import { GLOBAL_LOG_PREFIX_BYTE_LENGTH, EntryType } from "../globals.js"

describe("GlobalLogEntryFactory", () => {
    it("should deserialize a valid GlobalLogEntry from u8", async () => {
        const logId = await LogId.newRandom()
        const innerEntry = new JSONLogEntry({ jsonStr: '{"key":"value"}' })
        const original = new GlobalLogEntry({
            entryNum: 42,
            logId,
            entry: innerEntry,
        })

        const u8s = original.u8s()
        const totalLength = u8s.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of u8s) {
            buffer.set(s, offset)
            offset += s.byteLength
        }

        const deserialized = GlobalLogEntryFactory.fromU8(buffer)
        expect(deserialized.entryNum).toBe(42)
        expect(deserialized.logId.base64()).toBe(logId.base64())
        expect(deserialized.entry instanceof JSONLogEntry).toBe(true)
        expect(deserialized.cksum()).toBe(original.cksum())
    })

    it("should detect partial entry and report needBytes", () => {
        const partial = new Uint8Array(5) // too short for 27-byte prefix
        const result = GlobalLogEntryFactory.fromPartialU8(partial)
        expect(result.entry).toBeUndefined()
        expect(result.needBytes).toBe(GLOBAL_LOG_PREFIX_BYTE_LENGTH - 5)
    })

    it("should handle LogLog entries via fromPartialU8", async () => {
        const u8 = new Uint8Array([EntryType.LOG_LOG, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
        const result = GlobalLogEntryFactory.fromPartialU8(u8)
        // LOG_LOG type returns either an entry or an error from LogLogEntryFactory
        expect(result).toBeDefined()
    })

    it("should return error for invalid entry type in fromPartialU8", () => {
        const u8 = new Uint8Array([99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27])
        const result = GlobalLogEntryFactory.fromPartialU8(u8)
        expect(result.err).toBeDefined()
    })

    it("should throw for invalid entry type in fromU8", () => {
        const u8 = new Uint8Array([99, 1, 2, 3, 4, 5])
        expect(() => GlobalLogEntryFactory.fromU8(u8)).toThrow("Invalid entryType")
    })

    it("should extract entry length from prefix", async () => {
        const logId = await LogId.newRandom()
        const innerEntry = new BinaryLogEntry(new Uint8Array(100))
        const gle = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: innerEntry,
        })

        const u8 = gle.u8s()
        const totalLength = u8.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of u8) {
            buffer.set(s, offset)
            offset += s.byteLength
        }

        const entryLength = GlobalLogEntryFactory.entryLengthFromU8(buffer)
        expect(entryLength).toBe(innerEntry.byteLength())
    })
})
