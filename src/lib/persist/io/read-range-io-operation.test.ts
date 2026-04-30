import { describe, expect, it } from "@jest/globals"

import ReadRangeIOOperation from "./read-range-io-operation.js"

describe("ReadRangeIOOperation", () => {
    it("should create with reads and logId", () => {
        const op = new ReadRangeIOOperation([0, 100, 200])
        expect(op.reads).toEqual([0, 100, 200])
        expect(op.buffers).toEqual([])
        expect(op.bytesRead).toBe(0)
    })

    it("should create with null reads", () => {
        const op = new ReadRangeIOOperation()
        expect(op.reads).toBeNull()
    })
})
