import { describe, expect, it } from "@jest/globals"

import LogId from "../log/log-id.js"
import BinaryLogEntry from "./binary-log-entry.js"
import GlobalLogEntry from "./global-log-entry.js"

describe("GlobalLogEntry", () => {
    it("should create with entryNum, logId, and entry", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        expect(entry.entryNum).toBe(0)
        expect(entry.logId).toBe(logId)
        expect(entry.entry).toBe(inner)
        expect(entry.crc).toBeNull()
    })

    it("should create with crc", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner, crc: 12345 })
        expect(entry.crc).toBe(12345)
    })

    it("should generate key", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 5, logId, entry: inner })
        expect(entry.key()).toBe(`${logId.base64()}-5`)
    })

    it("should compute byte length", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        expect(entry.byteLength()).toBe(31)
    })

    it("should compute checksum", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const cksum = entry.cksum()
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should produce prefixU8 of correct length", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        expect(entry.prefixU8().byteLength).toBe(27)
    })

    it("should return segments via u8s()", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const segments = entry.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0].byteLength).toBe(27)
    })

    it("should verify crc when set", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner, crc: 0 })
        expect(entry.verify()).toBe(false)
    })

    it("should return false on verify when crc is null", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        expect(entry.verify()).toBe(false)
    })

    it("should cache prefixU8 on second call", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const prefix = entry.prefixU8()
        expect(entry.prefixU8()).toBe(prefix)
    })

    it("should cache checksum on second call", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const cksum = entry.cksum()
        expect(entry.cksum()).toBe(cksum)
    })

    it("should return u8 from inner entry", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        expect(entry.u8()).toEqual(new Uint8Array([1, 2, 3]))
    })

    it("should verify with matching crc", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const cksum = entry.cksum()
        const entry2 = new GlobalLogEntry({ entryNum: 0, logId, entry: inner, crc: cksum })
        expect(entry2.verify()).toBe(true)
    })
})
