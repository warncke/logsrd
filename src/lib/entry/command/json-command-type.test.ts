import { describe, expect, it } from "@jest/globals"

import JSONCommandType from "./command-type/json-command-type.js"

describe("JSONCommandType", () => {
    it("should create from commandNameU8 and value", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { key: "value" },
        })
        expect(cmd.value()).toEqual({ key: "value" })
    })

    it("should create from commandNameU8 and commandValueU8", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            commandValueU8: new TextEncoder().encode('{"key":"value"}'),
        })
        expect(cmd.value()).toEqual({ key: "value" })
    })

    it("should throw if neither value nor commandValueU8 provided", () => {
        expect(() => new JSONCommandType({ commandNameU8: new Uint8Array([0]) })).toThrow(
            "JSONCommandType requires commandNameU8 and either commandValueU8 or value",
        )
    })

    it("should set value", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { key: "value" },
        })
        cmd.setValue({ key: "newValue" })
        expect(cmd.value()).toEqual({ key: "newValue" })
    })

    it("should set value from string", () => {
        const cmd = new JSONCommandType({
            commandNameU8: new Uint8Array([0]),
            value: { key: "value" },
        })
        cmd.setValue('{"key":"strVal"}')
        expect(cmd.value()).toEqual({ key: "strVal" })
    })

    it("should throw if commandNameU8 missing", () => {
        expect(() => new JSONCommandType({ value: "test" } as any)).toThrow(
            "JSONCommandType requires commandNameU8 and either commandValueU8 or value",
        )
    })
})
