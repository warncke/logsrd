import { describe, expect, it } from "@jest/globals"

import LogId from "../../log/log-id.js"
import LogIndex from "../../log/log-index.js"
import ReadEntryIOOperation from "./read-entry-io-operation.js"

describe("ReadEntryIOOperation", () => {
    it("should create with logId, index, and entryNum", async () => {
        const logId = await LogId.newRandom()
        const index = new LogIndex()
        const op = new ReadEntryIOOperation(logId, index, 5)
        expect(op.index).toBe(index)
        expect(op.entryNum).toBe(5)
        expect(op.entry).toBeNull()
        expect(op.bytesRead).toBe(0)
    })
})
