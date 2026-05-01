import { describe, expect, it } from "@jest/globals"

import JSONCommandType from "./json-command-type.js"

describe("JSONCommandType", () => {
    it("should create with commandNameU8 and commandValueU8", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode(JSON.stringify({ key: "value" })),
        })
        const val = cmd.value()
        expect(val.key).toBe("value")
    })

    it("should create with commandNameU8 and value object", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { key: "value", num: 42 },
        })
        const val = cmd.value()
        expect(val.key).toBe("value")
        expect(val.num).toBe(42)
    })

    it("should create with commandNameU8 and value string", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: JSON.stringify({ key: "value" }),
        })
        const val = cmd.value()
        expect(val.key).toBe("value")
    })

    it("should compute byte length", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { a: 1 },
        })
        // 1 byte type + 1 byte commandName + value length
        expect(cmd.byteLength()).toBeGreaterThan(2)
    })

    it("should compute checksum", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { a: 1 },
        })
        const cksum = cmd.cksum(0)
        expect(typeof cksum).toBe("number")
        expect(cksum).not.toBe(0)
    })

    it("should cache checksum on second call", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { a: 1 },
        })
        const cksum = cmd.cksum(0)
        expect(cmd.cksum(0)).toBe(cksum)
    })

    it("should return segments via u8s()", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { a: 1 },
        })
        const segments = cmd.u8s()
        expect(segments).toHaveLength(3)
        expect(segments[0]).toEqual(new Uint8Array([4])) // EntryType.COMMAND
        expect(segments[1]).toEqual(new Uint8Array([0]))
    })

    it("should set value via setValue", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { a: 1 },
        })
        cmd.setValue({ b: 2 })
        const val = cmd.value()
        expect(val.b).toBe(2)
        expect(val.a).toBeUndefined()
    })

    it("should throw if no commandNameU8 or value provided", () => {
        expect(() => new JSONCommandType({} as any)).toThrow(
            "JSONCommandType requires commandNameU8 and either commandValueU8 or value",
        )
    })
})
