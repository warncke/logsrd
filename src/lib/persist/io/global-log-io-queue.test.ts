import { describe, expect, it } from "@jest/globals"

import { IOOperationType } from "../../globals.js"
import GlobalLogIOQueue from "./global-log-io-queue.js"
import IOOperation from "./io-operation.js"

describe("GlobalLogIOQueue", () => {
    it("should start empty", () => {
        const queue = new GlobalLogIOQueue()
        expect(queue.opPending()).toBe(false)
    })

    it("should enqueue global operations", () => {
        const queue = new GlobalLogIOQueue()
        const op = new IOOperation(IOOperationType.WRITE)
        queue.enqueue(op)
        expect(queue.opPending()).toBe(true)
    })

    it("should enqueue log-specific operations", () => {
        const queue = new GlobalLogIOQueue()
        const op = new IOOperation(IOOperationType.WRITE, { base64: () => "testLogId" } as any)
        queue.enqueue(op)
        expect(queue.opPending()).toBe(true)
    })

    it("should get log queue", () => {
        const queue = new GlobalLogIOQueue()
        const logQueue = queue.getLogQueue({ base64: () => "testLogId" } as any)
        expect(logQueue).toBeDefined()
        expect(queue.opPending()).toBe(false)
    })

    it("should get global queue", () => {
        const queue = new GlobalLogIOQueue()
        const globalQueue = queue.getGlobalQueue()
        expect(globalQueue).toBeDefined()
    })

    it("should delete log queue", () => {
        const queue = new GlobalLogIOQueue()
        const logId = { base64: () => "testLogId" } as any
        queue.getLogQueue(logId)
        const deleted = queue.deleteLogQueue(logId)
        expect(deleted).toBeDefined()
        expect(queue.deleteLogQueue(logId)).toBeNull()
    })

    it("should get ready operations sorted by order", () => {
        const queue = new GlobalLogIOQueue()
        const op1 = new IOOperation(IOOperationType.WRITE)
        const op2 = new IOOperation(IOOperationType.WRITE)
        queue.enqueue(op1)
        queue.enqueue(op2)
        const [, writes] = queue.getReady()
        expect(writes).toHaveLength(2)
        expect(writes[0].order).toBeLessThan(writes[1].order)
    })

    it("should return false for opPending when no queues have ops", () => {
        const queue = new GlobalLogIOQueue()
        queue.getLogQueue({ base64: () => "empty" } as any)
        expect(queue.opPending()).toBe(false)
    })
})
