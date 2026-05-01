import { describe, expect, it } from "@jest/globals"

import { EntryType } from "../globals.js"
import CommandLogEntry from "./command-log-entry.js"

describe("CommandLogEntry", () => {
    it("should create with command name and value", () => {
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode("test"),
        })
        expect(entry.byteLength()).toBe(6)
    })

    it("should compute checksum", () => {
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode("test"),
        })
        const cksum = entry.cksum(0)
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should cache checksum on second call", () => {
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode("test"),
        })
        const cksum = entry.cksum(0)
        expect(entry.cksum(0)).toBe(cksum)
    })

    it("should return segments via u8s()", () => {
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode("test"),
        })
        const segments = entry.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0]).toEqual(new Uint8Array([4]))
        expect(segments[1]).toEqual(new Uint8Array([0]))
    })

    it("should return command value via u8()", () => {
        const value = new TextEncoder().encode("test")
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: value,
        })
        expect(entry.u8()).toEqual(value)
    })

    it("should throw on value() by default", () => {
        const entry = new CommandLogEntry({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode("test"),
        })
        expect(() => entry.value()).toThrow("Not implemented")
    })
})
