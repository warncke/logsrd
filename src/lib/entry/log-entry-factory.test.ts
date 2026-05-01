import { describe, expect, it } from "@jest/globals"

import { EntryType } from "../globals.js"
import JSONLogEntry from "./json-log-entry.js"
import LogEntryFactory from "./log-entry-factory.js"

describe("LogEntryFactory", () => {
    it("should throw on invalid entry type", () => {
        const invalid = new Uint8Array([99, 1, 2, 3])
        expect(() => LogEntryFactory.fromU8(invalid)).toThrow("Invalid entryType")
    })

    it("should return needBytes for empty buffer in fromPartialU8", () => {
        const result = LogEntryFactory.fromPartialU8(new Uint8Array(0))
        expect(result.needBytes).toBe(1)
        expect(result.entry).toBeUndefined()
        expect(result.err).toBeUndefined()
    })

    it("should return error for non-global/log entry types in fromPartialU8", () => {
        const result = LogEntryFactory.fromPartialU8(new Uint8Array([4]))
        expect(result.err).toBeDefined()
        expect(result.err!.message).toContain("Invalid entryType")
    })

    it("should throw on undefined entryType in fromU8", () => {
        expect(() => LogEntryFactory.fromU8(new Uint8Array([]))).toThrow("Invalid entryType")
    })

    it("should parse a COMMAND type entry via fromU8", () => {
        const commandU8 = new Uint8Array([EntryType.COMMAND, 0, 0x7b, 0x7d]) // COMMAND + CREATE_LOG + {}
        const result = LogEntryFactory.fromU8(commandU8)
        expect(result).toBeDefined()
    })
})
