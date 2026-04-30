import { describe, expect, it, jest } from "@jest/globals"

import AppendQueue from "./append-queue.js"
import GlobalLogEntry from "../entry/global-log-entry.js"
import BinaryLogEntry from "../entry/binary-log-entry.js"
import LogId from "./log-id.js"
import Log from "../log.js"

jest.mock("../log.js", () => {
    return {
        __esModule: true,
        default: jest.fn<any>().mockImplementation(() => ({
            logId: null,
            server: {
                config: { hosts: [] },
                persist: { newHotLog: { enqueueOp: jest.fn<any>().mockImplementation((op: any) => { op.complete(op); }) } },
                replicate: { appendReplica: jest.fn<any>().mockResolvedValue(undefined) },
                subscribe: { publish: jest.fn<any>() },
            },
            stats: { addOp: jest.fn<any>() },
            config: { logId: "test", type: "json", master: "127.0.0.1:7000", access: "private", authType: "token", stopped: false },
            stopped: false,
            appendQueue: null,
            appendInProgress: null,
            stop: jest.fn<any>().mockResolvedValue(undefined),
        })),
    }
})

function makeLogEntry(entryNum: number): GlobalLogEntry {
    return new GlobalLogEntry({
        entryNum,
        logId: new LogId(new Uint8Array(16)),
        entry: new BinaryLogEntry(new Uint8Array([entryNum])),
    })
}

describe("AppendQueue", () => {
    it("should enqueue entry and waitHead should resolve with correct entry", async () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        const queue = new AppendQueue(log)
        const entry = makeLogEntry(1)
        queue.enqueue(entry)

        const head = await queue.waitHead()
        expect(head).toBe(entry)
        expect(queue.hasEntries()).toBe(true)
    })

    it("should enqueue entry with config and waitConfig should resolve with config entry", async () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        const queue = new AppendQueue(log)

        const configEntry = makeLogEntry(1)
        queue.enqueue(configEntry, { logId: "test", type: "json", master: "127.0.0.1:7000", access: "private", authType: "token", stopped: false } as any)

        const config = await queue.waitConfig()
        expect(config).toBe(configEntry)
        expect(queue.hasConfig()).toBe(true)
    })

    it("should report hasEntries correctly", () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        const queue = new AppendQueue(log)
        expect(queue.hasEntries()).toBe(false)

        const entry = makeLogEntry(1)
        queue.enqueue(entry)
        expect(queue.hasEntries()).toBe(true)
    })

    it("should report hasConfig correctly", () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        const queue = new AppendQueue(log)
        expect(queue.hasConfig()).toBe(false)

        const entry = makeLogEntry(1)
        queue.enqueue(entry, {} as any)
        expect(queue.hasConfig()).toBe(true)
    })

    it("should reject promise on completeWithError", async () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        // Prevent process from running by setting appendInProgress
        log.appendInProgress = {} as any
        const queue = new AppendQueue(log)
        queue.enqueue(makeLogEntry(1))
        // Reset appendInProgress so we can test completeWithError
        log.appendInProgress = null
        // Manually reject
        queue.completeWithError(new Error("test error"))
        await expect(queue.waitHead()).rejects.toThrow("test error")
    })

    it("should resolve waitHead promise on complete", async () => {
        const log = new (Log as any)()
        log.logId = new LogId(new Uint8Array(16))
        const queue = new AppendQueue(log)
        const entry = makeLogEntry(1)
        queue.enqueue(entry)

        setTimeout(() => {
            queue.complete()
        }, 10)

        const head = await queue.waitHead()
        expect(head).toBe(entry)
    })
})
