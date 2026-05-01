import { describe, expect, it } from "@jest/globals"

import { EntryType } from "../globals.js"
import LogLogCheckpoint from "./log-log-checkpoint.js"

describe("LogLogCheckpoint", () => {
    it("should create with offset, length, and config offset", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        expect(cp.lastEntryOffset).toBe(100)
        expect(cp.lastEntryLength).toBe(50)
        expect(cp.lastConfigOffset).toBe(200)
        expect(cp.crc).toBeNull()
    })

    it("should create with crc", () => {
        const cp = new LogLogCheckpoint({
            lastEntryOffset: 100,
            lastEntryLength: 50,
            lastConfigOffset: 200,
            crc: 12345,
        })
        expect(cp.crc).toBe(12345)
    })

    it("should have fixed byte length", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        expect(cp.byteLength()).toBe(13)
    })

    it("should compute checksum", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const cksum = cp.cksum()
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should verify crc when set", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200, crc: 0 })
        expect(cp.verify()).toBe(false)
    })

    it("should return false on verify when crc is null", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        expect(cp.verify()).toBe(false)
    })

    it("should return segments via u8s()", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const segments = cp.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0]).toEqual(new Uint8Array([3]))
    })

    it("should cache u8 on second call", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const u8 = cp.u8()
        expect(cp.u8()).toBe(u8)
    })

    it("should cache checksum on second call", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const cksum = cp.cksum()
        expect(cp.cksum()).toBe(cksum)
    })

    it("should deserialize from Uint8Array", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const buffer = cp.u8s()
        const totalLength = buffer.reduce((acc, s) => acc + s.byteLength, 0)
        const fullBuffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of buffer) {
            fullBuffer.set(s, offset)
            offset += s.byteLength
        }
        const deserialized = LogLogCheckpoint.fromU8(fullBuffer)
        expect(deserialized.lastEntryOffset).toBe(100)
        expect(deserialized.lastEntryLength).toBe(50)
        expect(deserialized.lastConfigOffset).toBe(200)
    })

    it("should throw on invalid entry type in fromU8", () => {
        const cp = new LogLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, lastConfigOffset: 200 })
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => LogLogCheckpoint.fromU8(invalid)).toThrow("Invalid entryType")
    })
})
