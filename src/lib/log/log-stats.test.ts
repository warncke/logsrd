import { describe, expect, it } from "@jest/globals"

import { IOOperationType } from "../globals.js"
import LogStats from "./log-stats.js"

class MockIOOperation {
    op: IOOperationType
    startTime: number
    endTime: number
    bytesRead: number = 0
    bytesWritten: number = 0

    constructor(op: IOOperationType, duration: number, bytes: number = 0) {
        this.op = op
        this.startTime = 0
        this.endTime = duration
        if (op === IOOperationType.WRITE) {
            this.bytesWritten = bytes
        } else {
            this.bytesRead = bytes
        }
    }
}

describe("LogStats", () => {
    it("should start with zero values", () => {
        const stats = new LogStats()
        expect(stats.ioReads).toBe(0)
        expect(stats.bytesRead).toBe(0)
        expect(stats.ioWrites).toBe(0)
        expect(stats.bytesWritten).toBe(0)
    })

    it("should track read operations", () => {
        const stats = new LogStats()
        const op = new MockIOOperation(IOOperationType.READ_ENTRY, 100, 50)
        stats.addOp(op as any)
        expect(stats.ioReads).toBe(1)
        expect(stats.bytesRead).toBe(50)
        expect(stats.ioReadTimeAvg).toBe(100)
        expect(stats.ioReadTimeMax).toBe(100)
        expect(stats.ioReadLastTime).toBe(100)
    })

    it("should track write operations", () => {
        const stats = new LogStats()
        const op = new MockIOOperation(IOOperationType.WRITE, 200, 100)
        stats.addOp(op as any)
        expect(stats.ioWrites).toBe(1)
        expect(stats.bytesWritten).toBe(100)
        expect(stats.ioWriteTimeAvg).toBe(200)
        expect(stats.ioWriteTimeMax).toBe(200)
        expect(stats.ioWriteLastTime).toBe(200)
    })

    it("should calculate average read time correctly", () => {
        const stats = new LogStats()
        stats.addOp(new MockIOOperation(IOOperationType.READ_ENTRY, 100, 10) as any)
        stats.addOp(new MockIOOperation(IOOperationType.READ_ENTRY, 200, 20) as any)
        expect(stats.ioReads).toBe(2)
        expect(stats.ioReadTimeAvg).toBe(150)
        expect(stats.ioReadTimeMax).toBe(200)
    })

    it("should calculate average write time correctly", () => {
        const stats = new LogStats()
        stats.addOp(new MockIOOperation(IOOperationType.WRITE, 100, 10) as any)
        stats.addOp(new MockIOOperation(IOOperationType.WRITE, 300, 20) as any)
        expect(stats.ioWrites).toBe(2)
        expect(stats.ioWriteTimeAvg).toBe(200)
        expect(stats.ioWriteTimeMax).toBe(300)
    })

    it("should track max read time", () => {
        const stats = new LogStats()
        stats.addOp(new MockIOOperation(IOOperationType.READ_ENTRY, 50, 5) as any)
        stats.addOp(new MockIOOperation(IOOperationType.READ_ENTRY, 500, 10) as any)
        stats.addOp(new MockIOOperation(IOOperationType.READ_ENTRY, 100, 15) as any)
        expect(stats.ioReadTimeMax).toBe(500)
    })

    it("should track max write time", () => {
        const stats = new LogStats()
        stats.addOp(new MockIOOperation(IOOperationType.WRITE, 50, 5) as any)
        stats.addOp(new MockIOOperation(IOOperationType.WRITE, 600, 10) as any)
        expect(stats.ioWriteTimeMax).toBe(600)
    })

    it("should handle READ_ENTRIES operations", () => {
        const stats = new LogStats()
        const op = new MockIOOperation(IOOperationType.READ_ENTRIES, 150, 200)
        stats.addOp(op as any)
        expect(stats.ioReads).toBe(1)
        expect(stats.bytesRead).toBe(200)
    })

    it("should handle READ_RANGE operations", () => {
        const stats = new LogStats()
        const op = new MockIOOperation(IOOperationType.READ_RANGE, 75, 300)
        stats.addOp(op as any)
        expect(stats.ioReads).toBe(1)
        expect(stats.bytesRead).toBe(300)
    })

    it("should throw on unknown operation type", () => {
        const stats = new LogStats()
        const op = new MockIOOperation(99 as IOOperationType, 100)
        expect(() => stats.addOp(op as any)).toThrow("unknown IO op")
    })
})
