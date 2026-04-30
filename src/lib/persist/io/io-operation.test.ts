import { describe, expect, it, jest } from "@jest/globals"

import { IOOperationType } from "../../globals.js"
import IOOperation from "./io-operation.js"

describe("IOOperation", () => {
    let consoleErrorSpy: any

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {})
    })

    afterEach(() => {
        consoleErrorSpy.mockRestore()
    })

    it("should create with op type", () => {
        const op = new IOOperation(IOOperationType.WRITE)
        expect(op.op).toBe(IOOperationType.WRITE)
        expect(op.logId).toBeNull()
        expect(op.startTime).toBeGreaterThan(0)
        expect(op.endTime).toBe(0)
        expect(op.processing).toBe(false)
    })

    it("should create with logId", () => {
        const op = new IOOperation(IOOperationType.READ_ENTRY, { base64: () => "test" } as any)
        expect(op.op).toBe(IOOperationType.READ_ENTRY)
    })

    it("should complete and set endTime", () => {
        const op = new IOOperation(IOOperationType.WRITE)
        op.complete(op)
        expect(op.endTime).toBeGreaterThan(0)
    })

    it("should completeWithError and set endTime", async () => {
        const op = new IOOperation(IOOperationType.WRITE)
        const promise = op.promise
        op.completeWithError(new Error("test error"))
        await expect(promise).rejects.toThrow("test error")
        expect(op.endTime).toBeGreaterThan(0)
    })

    it("should have incrementing order", () => {
        const op1 = new IOOperation(IOOperationType.WRITE)
        const op2 = new IOOperation(IOOperationType.WRITE)
        expect(op2.order).toBeGreaterThan(op1.order)
    })

    it("should handle complete with null resolve via retry without console pollution", () => {
        jest.useFakeTimers()
        const op = new IOOperation(IOOperationType.WRITE, null, Promise.resolve({} as any), null, null)
        op.complete(op)
        expect(op.endTime).toBeGreaterThan(0)
        jest.useRealTimers()
    })

    it("should handle completeWithError with null reject via retry without console pollution", () => {
        jest.useFakeTimers()
        const op = new IOOperation(IOOperationType.WRITE, null, new Promise(() => {}), null, null)
        op.completeWithError(new Error("test"))
        expect(op.endTime).toBeGreaterThan(0)
        jest.useRealTimers()
    })
})
