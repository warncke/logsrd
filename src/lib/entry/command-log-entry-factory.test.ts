import { describe, expect, it } from "@jest/globals"

import CommandLogEntryFactory from "./command-log-entry-factory.js"

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
})
