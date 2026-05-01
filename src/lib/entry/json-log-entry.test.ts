import { describe, expect, it } from "@jest/globals"

import { EntryType } from "../globals.js"
import JSONLogEntry from "./json-log-entry.js"

describe("JSONLogEntry", () => {
    it("should create from string", () => {
        const entry = new JSONLogEntry({ jsonStr: '{"key":"value"}' })
        expect(entry.str()).toBe('{"key":"value"}')
    })

    it("should create from Uint8Array", () => {
        const u8 = new TextEncoder().encode('{"key":"value"}')
        const entry = new JSONLogEntry({ jsonU8: u8 })
        expect(entry.str()).toBe('{"key":"value"}')
    })

    it("should throw if no data provided", () => {
        expect(() => new JSONLogEntry({})).toThrow("Must provide jsonStr or jsonU8")
    })

    it("should compute byte length", () => {
        const entry = new JSONLogEntry({ jsonStr: '{"a":1}' })
        expect(entry.byteLength()).toBe(8)
    })

    it("should compute checksum", () => {
        const entry = new JSONLogEntry({ jsonStr: '{"a":1}' })
        const cksum = entry.cksum(0)
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should produce consistent checksum for same data", () => {
        const entry1 = new JSONLogEntry({ jsonStr: '{"a":1}' })
        const entry2 = new JSONLogEntry({ jsonStr: '{"a":1}' })
        expect(entry1.cksum(0)).toBe(entry2.cksum(0))
    })

    it("should return segments via u8s()", () => {
        const entry = new JSONLogEntry({ jsonStr: "{}" })
        const segments = entry.u8s()
        expect(segments).toHaveLength(2)
        expect(segments[0]).toEqual(new Uint8Array([6]))
        expect(segments[1]).toEqual(new TextEncoder().encode("{}"))
    })

    it("should deserialize from Uint8Array", () => {
        const original = new JSONLogEntry({ jsonStr: '{"key":"value"}' })
        const buffer = original.u8()
        const typeByte = new Uint8Array([6])
        const fullBuffer = new Uint8Array(1 + buffer.byteLength)
        fullBuffer.set(typeByte)
        fullBuffer.set(buffer, 1)
        const deserialized = JSONLogEntry.fromU8(fullBuffer)
        expect(deserialized.str()).toBe('{"key":"value"}')
    })

    it("should throw on invalid entry type", () => {
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => JSONLogEntry.fromU8(invalid)).toThrow("Invalid entryType")
    })

    it("should cache u8 on second call", () => {
        const entry = new JSONLogEntry({ jsonStr: '{"a":1}' })
        const u8 = entry.u8()
        expect(entry.u8()).toBe(u8)
    })

    it("should cache str on second call", () => {
        const u8 = new TextEncoder().encode('{"a":1}')
        const entry = new JSONLogEntry({ jsonU8: u8 })
        const str = entry.str()
        expect(entry.str()).toBe(str)
    })

    it("should throw on u8 when no data", () => {
        const entry = new JSONLogEntry({ jsonStr: '{"a":1}' })
        const u8 = entry.u8()
        expect(entry.u8()).toBe(u8)
    })
})
