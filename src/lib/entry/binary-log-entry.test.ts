import { describe, expect, it } from "@jest/globals"

import BinaryLogEntry from "./binary-log-entry.js"

describe("BinaryLogEntry", () => {
    it("should create from Uint8Array", () => {
        const data = new Uint8Array([1, 2, 3, 4])
        const entry = new BinaryLogEntry(data)
        expect(entry.byteLength()).toBe(5)
    })

    it("should return the raw data via u8()", () => {
        const data = new Uint8Array([10, 20, 30])
        const entry = new BinaryLogEntry(data)
        expect(entry.u8()).toEqual(data)
    })

    it("should return segments via u8s()", () => {
        const data = new Uint8Array([10, 20])
        const entry = new BinaryLogEntry(data)
        const segments = entry.u8s()
        expect(segments).toHaveLength(2)
        expect(segments[0]).toEqual(new Uint8Array([5]))
        expect(segments[1]).toEqual(data)
    })

    it("should compute checksum", () => {
        const data = new Uint8Array([1, 2, 3])
        const entry = new BinaryLogEntry(data)
        const cksum = entry.cksum(0)
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should produce consistent checksum for same data", () => {
        const data = new Uint8Array([1, 2, 3])
        const entry1 = new BinaryLogEntry(data)
        const entry2 = new BinaryLogEntry(data)
        expect(entry1.cksum(0)).toBe(entry2.cksum(0))
    })

    it("should cache checksum on second call", () => {
        const data = new Uint8Array([1, 2, 3])
        const entry = new BinaryLogEntry(data)
        const cksum = entry.cksum(0)
        expect(entry.cksum(0)).toBe(cksum)
    })

    it("should deserialize from Uint8Array", () => {
        const data = new Uint8Array([1, 2, 3])
        const original = new BinaryLogEntry(data)
        const serialized = original.u8s()
        const totalLength = serialized.reduce((acc, s) => acc + s.byteLength, 0)
        const buffer = new Uint8Array(totalLength)
        let offset = 0
        for (const s of serialized) {
            buffer.set(s, offset)
            offset += s.byteLength
        }
        const deserialized = BinaryLogEntry.fromU8(buffer)
        expect(deserialized.u8()).toEqual(data)
    })

    it("should throw on invalid entry type", () => {
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => BinaryLogEntry.fromU8(invalid)).toThrow("Invalid entryType")
    })
})
