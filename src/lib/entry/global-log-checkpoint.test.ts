import { describe, expect, it } from "@jest/globals"

import { EntryType } from "../globals.js"
import GlobalLogCheckpoint from "./global-log-checkpoint.js"

describe("GlobalLogCheckpoint", () => {
    it("should create with offset and length", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        expect(cp.lastEntryOffset).toBe(100)
        expect(cp.lastEntryLength).toBe(50)
        expect(cp.crc).toBeNull()
    })

    it("should create with crc", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, crc: 12345 })
        expect(cp.crc).toBe(12345)
    })

    it("should have fixed byte length", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        expect(cp.byteLength()).toBe(9)
    })

    it("should compute checksum", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        const cksum = cp.cksum()
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should cache checksum on second call", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        const cksum = cp.cksum()
        expect(cp.cksum()).toBe(cksum)
    })

    it("should verify crc when set", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50, crc: 0 })
        expect(cp.verify()).toBe(false)
    })

    it("should return false on verify when crc is null", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        expect(cp.verify()).toBe(false)
    })

    it("should return segments via u8s()", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        const segments = cp.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0]).toEqual(new Uint8Array([2]))
    })

    it("should cache u8 on second call", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        const u8 = cp.u8()
        expect(cp.u8()).toBe(u8)
    })

    it("should deserialize from Uint8Array", () => {
        const cp = new GlobalLogCheckpoint({ lastEntryOffset: 100, lastEntryLength: 50 })
        const segments = cp.u8s()
        const totalLength = segments.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of segments) {
            buffer.set(s, offset)
            offset += s.byteLength
        }
        const deserialized = GlobalLogCheckpoint.fromU8(buffer)
        expect(deserialized.lastEntryOffset).toBe(100)
        expect(deserialized.lastEntryLength).toBe(50)
    })

    it("should throw on invalid entry type", () => {
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => GlobalLogCheckpoint.fromU8(invalid)).toThrow("Invalid entryType")
    })
})
