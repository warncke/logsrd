import { describe, expect, it } from "@jest/globals"

import LogId from "../../log/log-id.js"
import LogIndex from "../../log/log-index.js"
import ReadEntriesIOOperation from "./read-entries-io-operation.js"

describe("ReadEntriesIOOperation", () => {
    it("should create with logId, index, and entryNums", async () => {
        const logId = await LogId.newRandom()
        const index = new LogIndex()
        const op = new ReadEntriesIOOperation(logId, index, [1, 2, 3])
        expect(op.index).toBe(index)
        expect(op.entryNums).toEqual([1, 2, 3])
        expect(op.entries).toBeNull()
        expect(op.bytesRead).toBe(0)
    })
})
