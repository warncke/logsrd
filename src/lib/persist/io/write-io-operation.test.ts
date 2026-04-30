import { describe, expect, it } from "@jest/globals"

import BinaryLogEntry from "../../entry/binary-log-entry.js"
import GlobalLogEntry from "../../entry/global-log-entry.js"
import LogId from "../../log/log-id.js"
import WriteIOOperation from "./write-io-operation.js"

describe("WriteIOOperation", () => {
    it("should create with entry", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const op = new WriteIOOperation(entry)
        expect(op.entry).toBe(entry)
        expect(op.entryNum).toBeNull()
        expect(op.bytesWritten).toBe(0)
    })

    it("should create with entryNum", async () => {
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })
        const op = new WriteIOOperation(entry, null, 5)
        expect(op.entryNum).toBe(5)
    })
})
