import { describe, expect, it } from "@jest/globals"

import { CommandName } from "../globals.js"
import CommandLogEntryFactory from "./command-log-entry-factory.js"
import CreateLogCommand from "./command/create-log-command.js"
import SetConfigCommand from "./command/set-config-command.js"

describe("CommandLogEntryFactory", () => {
    it("should throw on invalid entry type", () => {
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => CommandLogEntryFactory.fromU8(invalid)).toThrow("Invalid entryType")
    })

    it("should throw on invalid command name", () => {
        const invalid = new Uint8Array([4, 99, 1, 2, 3])
        expect(() => CommandLogEntryFactory.fromU8(invalid)).toThrow("Invalid commandName")
    })

    it("should throw on undefined commandName", () => {
        const invalid = new Uint8Array([4])
        expect(() => CommandLogEntryFactory.fromU8(invalid)).toThrow("Invalid commandName")
    })

    it("should parse a valid CREATE_LOG command", () => {
        const valueU8 = new TextEncoder().encode(JSON.stringify({ logId: "test" }))
        const u8 = new Uint8Array(3 + valueU8.byteLength)
        u8[0] = 4 // COMMAND
        u8[1] = CommandName.CREATE_LOG
        u8.set(valueU8, 2)
        const command = CommandLogEntryFactory.fromU8(u8)
        expect(command).toBeInstanceOf(CreateLogCommand)
        expect(command.commandNameU8[0]).toBe(CommandName.CREATE_LOG)
    })

    it("should parse a valid SET_CONFIG command", () => {
        const valueU8 = new TextEncoder().encode(JSON.stringify({ logId: "test" }))
        const u8 = new Uint8Array(3 + valueU8.byteLength)
        u8[0] = 4 // COMMAND
        u8[1] = CommandName.SET_CONFIG
        u8.set(valueU8, 2)
        const command = CommandLogEntryFactory.fromU8(u8)
        expect(command).toBeInstanceOf(SetConfigCommand)
        expect(command.commandNameU8[0]).toBe(CommandName.SET_CONFIG)
    })
})
