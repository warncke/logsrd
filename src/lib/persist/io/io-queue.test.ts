import { describe, expect, it } from "@jest/globals"

import { IOOperationType } from "../../globals.js"
import IOOperation from "./io-operation.js"
import IOQueue from "./io-queue.js"

describe("IOQueue", () => {
    it("should start empty", () => {
        const queue = new IOQueue()
        expect(queue.opPending()).toBe(false)
    })

    it("should enqueue write operations", () => {
        const queue = new IOQueue()
        const op = new IOOperation(IOOperationType.WRITE)
        queue.enqueue(op)
        expect(queue.opPending()).toBe(true)
    })

    it("should enqueue read operations", () => {
        const queue = new IOQueue()
        const op = new IOOperation(IOOperationType.READ_ENTRY)
        queue.enqueue(op)
        expect(queue.opPending()).toBe(true)
    })

    it("should get ready operations", () => {
        const queue = new IOQueue()
        const writeOp = new IOOperation(IOOperationType.WRITE)
        const readOp = new IOOperation(IOOperationType.READ_ENTRY)
        queue.enqueue(writeOp)
        queue.enqueue(readOp)
        const [, writes] = queue.getReady()
        expect(writes).toHaveLength(1)
        expect(queue.opPending()).toBe(false)
    })

    it("should drain all operations", () => {
        const queue = new IOQueue()
        const op = new IOOperation(IOOperationType.WRITE)
        queue.enqueue(op)
        const [, writes] = queue.drain()
        expect(writes).toHaveLength(1)
        expect(queue.opPending()).toBe(false)
    })

    it("should return empty arrays from getReady when no ops pending", () => {
        const queue = new IOQueue()
        const [reads, writes] = queue.getReady()
        expect(reads).toHaveLength(0)
        expect(writes).toHaveLength(0)
    })
})
