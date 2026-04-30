import { describe, expect, it } from "@jest/globals"

import LogLogEntryFactory from "./log-log-entry-factory.js"
import LogLogEntry from "./log-log-entry.js"
import BinaryLogEntry from "./binary-log-entry.js"
import JSONLogEntry from "./json-log-entry.js"
import { LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals.js"

describe("LogLogEntryFactory", () => {
    it("should deserialize a valid LogLogEntry from u8", () => {
        const innerEntry = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const original = new LogLogEntry({
            entryNum: 100,
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

        const deserialized = LogLogEntryFactory.fromU8(buffer)
        expect(deserialized.entryNum).toBe(100)
        expect(deserialized.entry instanceof BinaryLogEntry).toBe(true)
        expect(deserialized.byteLength()).toBe(original.byteLength())
    })

    it("should handle LogLogEntry with JSON entry", () => {
        const innerEntry = new JSONLogEntry({ jsonStr: '{"test":true}' })
        const original = new LogLogEntry({
            entryNum: 5,
            entry: innerEntry,
        })

        const buffer = Buffer.concat(original.u8s())
        const deserialized = LogLogEntryFactory.fromU8(new Uint8Array(buffer))
        expect(deserialized.entryNum).toBe(5)
        expect(deserialized.entry instanceof JSONLogEntry).toBe(true)
    })

    it("should detect partial entry and report needBytes", () => {
        const partial = new Uint8Array(3)
        const result = LogLogEntryFactory.fromPartialU8(partial)
        expect(result.entry).toBeUndefined()
        expect(result.needBytes).toBe(LOG_LOG_PREFIX_BYTE_LENGTH - 3)
    })

    it("should return error for invalid entry type in fromPartialU8", () => {
        const u8 = new Uint8Array([99, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
        const result = LogLogEntryFactory.fromPartialU8(u8)
        expect(result.err).toBeDefined()
    })

    it("should throw for invalid entry type in fromU8", () => {
        const u8 = new Uint8Array([99, 1, 2, 3, 4, 5])
        expect(() => LogLogEntryFactory.fromU8(u8)).toThrow("Invalid entryType")
    })

    it("should extract entry length from prefix", () => {
        const innerEntry = new BinaryLogEntry(new Uint8Array(50))
        const original = new LogLogEntry({
            entryNum: 1,
            entry: innerEntry,
        })

        const buffer = Buffer.concat(original.u8s())
        const entryLength = LogLogEntryFactory.entryLengthFromU8(new Uint8Array(buffer))
        expect(entryLength).toBe(innerEntry.byteLength())
    })
})
