import { describe, expect, it } from "@jest/globals"

import BinaryLogEntry from "./binary-log-entry.js"
import LogLogEntry from "./log-log-entry.js"

describe("LogLogEntry", () => {
    it("should create with entry, entryNum", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const logEntry = new LogLogEntry({ entry: inner, entryNum: 0 })
        expect(logEntry.entry).toBe(inner)
        expect(logEntry.entryNum).toBe(0)
        expect(logEntry.crc).toBeNull()
    })

    it("should create with crc", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0, crc: 12345 })
        expect(entry.crc).toBe(12345)
    })

    it("should compute byte length", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        expect(entry.byteLength()).toBe(15)
    })

    it("should compute checksum", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        const cksum = entry.cksum()
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should cache checksum on second call", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        const cksum = entry.cksum()
        expect(entry.cksum()).toBe(cksum)
    })

    it("should produce prefixU8 of correct length", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        expect(entry.prefixU8().byteLength).toBe(11)
    })

    it("should cache prefixU8 on second call", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        const prefix = entry.prefixU8()
        expect(entry.prefixU8()).toBe(prefix)
    })

    it("should return segments via u8s()", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        const segments = entry.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0].byteLength).toBe(11)
    })

    it("should return u8 from inner entry", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        expect(entry.u8()).toEqual(new Uint8Array([1, 2, 3]))
    })

    it("should verify crc when set", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0, crc: 0 })
        expect(entry.verify()).toBe(false)
    })

    it("should return false on verify when crc is null", () => {
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new LogLogEntry({ entry: inner, entryNum: 0 })
        expect(entry.verify()).toBe(false)
    })
})
