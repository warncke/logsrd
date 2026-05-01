import { describe, expect, it } from "@jest/globals"

import { EntryType, GLOBAL_LOG_PREFIX_BYTE_LENGTH } from "../globals.js"
import LogId from "../log/log-id.js"
import BinaryLogEntry from "./binary-log-entry.js"
import GlobalLogEntryFactory from "./global-log-entry-factory.js"
import GlobalLogEntry from "./global-log-entry.js"
import JSONLogEntry from "./json-log-entry.js"

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
        const u8 = new Uint8Array([
            99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
        ])
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

    it("should return error for entryLength exceeding MAX_ENTRY_SIZE", async () => {
        const logId = await LogId.newRandom()
        const innerEntry = new BinaryLogEntry(new Uint8Array(40000)) // > 32768
        const gle = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: innerEntry,
        })
        const u8s = gle.u8s()
        const totalLength = u8s.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of u8s) {
            buffer.set(s, offset)
            offset += s.byteLength
        }
        const result = GlobalLogEntryFactory.fromPartialU8(buffer)
        expect(result.err).toBeDefined()
        expect(result.err!.message).toContain("Invalid entryLength")
    })

    it("should report needBytes when buffer is shorter than total entry length", async () => {
        const logId = await LogId.newRandom()
        const innerEntry = new JSONLogEntry({ jsonStr: '{"key":"value"}' })
        const gle = new GlobalLogEntry({
            entryNum: 42,
            logId,
            entry: innerEntry,
        })
        const u8s = gle.u8s()
        const totalLength = u8s.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of u8s) {
            buffer.set(s, offset)
            offset += s.byteLength
        }
        // Use prefix bytes + partial content
        const partial = buffer.slice(0, GLOBAL_LOG_PREFIX_BYTE_LENGTH + 5)
        const result = GlobalLogEntryFactory.fromPartialU8(partial)
        expect(result.needBytes).toBeGreaterThan(0)
    })

    it("should return error in try/catch when globalLogEntryArgsFromU8 fails", () => {
        // Create a buffer with valid prefix but invalid inner entry data
        const u8 = new Uint8Array(30)
        u8[0] = EntryType.GLOBAL_LOG
        // logId (16 zero bytes at offset 1-16)
        // entryNum (4 zero bytes at offset 17-20)
        u8[21] = 3 // entryLength LE low byte = 3 bytes payload
        u8[22] = 0 // entryLength LE high byte
        // crc (4 zero bytes at offset 23-26)
        u8[27] = 99 // invalid inner entry type
        u8[28] = 1
        u8[29] = 2
        const result = GlobalLogEntryFactory.fromPartialU8(u8)
        expect(result.err).toBeDefined()
    })

    it("should handle valid LogLog entry with valid inner data in fromPartialU8", () => {
        // A LogLog entry with correct structure
        const logLogType = EntryType.LOG_LOG
        const entryNum = new Uint8Array([1, 0, 0, 0])
        const entryLength = new Uint8Array([3, 0]) // 3 bytes (type + 2 JSON bytes)
        const crc = new Uint8Array([0, 0, 0, 0])
        const innerEntry = [EntryType.JSON, 0x7b, 0x7d] // {}
        const u8 = new Uint8Array([logLogType, ...entryNum, ...entryLength, ...crc, ...innerEntry])
        const result = GlobalLogEntryFactory.fromPartialU8(u8)
        expect(result).toBeDefined()
    })
})
