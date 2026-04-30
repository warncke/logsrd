import { describe, expect, it } from "@jest/globals"

import CreateLogCommand from "../entry/command/create-log-command.js"
import LogLogIndex from "./log-log-index.js"

describe("LogLogIndex", () => {
    it("should calculate byte length using LOG_LOG_PREFIX_BYTE_LENGTH", () => {
        const index = new LogLogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 0, 100)
        expect(index.byteLength()).toBe(89)
    })

    it("should calculate byte length for multiple entries", () => {
        const index = new LogLogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 0, 50)
        index.addEntry(entry, 1, 50, 75)
        expect(index.byteLength()).toBe(103)
    })
})
