import { describe, expect, it, jest } from "@jest/globals"

import Log from "./log.js"
import LogId from "./log/log-id.js"
import BinaryLogEntry from "./entry/binary-log-entry.js"

jest.mock("./persist/log-log.js", () => {
    return {
        __esModule: true,
        default: jest.fn<any>().mockImplementation(() => ({
            logName: () => "mock-log-log",
            enqueueOp: jest.fn<any>(),
            ioQueue: { enqueue: jest.fn<any>() },
            server: {} as any,
            log: {} as any,
            init: jest.fn<any>().mockResolvedValue(undefined),
            byteLength: 0,
        })),
    }
})

function createMockServer() {
    return {
        config: { logDir: "/tmp/test-logs" },
        persist: {
            newHotLog: {
                logFile: "/tmp/test/new.log",
                ioQueue: {
                    enqueue: jest.fn<any>(),
                    deleteLogQueue: jest.fn<any>().mockReturnValue(null),
                },
                enqueueOp: jest.fn<any>(),
            },
            oldHotLog: {
                logFile: "/tmp/test/old.log",
                ioQueue: {
                    enqueue: jest.fn<any>(),
                    deleteLogQueue: jest.fn<any>().mockReturnValue(null),
                },
                enqueueOp: jest.fn<any>(),
            },
        },
        logs: new Map(),
        getLog: jest.fn<any>().mockReturnValue({
            newHotLogIndex: null,
            oldHotLogIndex: null,
            logLogIndex: null,
            addNewHotLogEntry: jest.fn<any>(),
            addOldHotLogEntry: jest.fn<any>(),
        }),
    }
}

describe("Log", () => {
    it("should initialize with correct properties", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        expect(log.logId.base64()).toBe(logId.base64())
        expect(log.stats).toBeDefined()
        expect(log.stats.ioReads).toBe(0)
        expect(log.newHotLogIndex).toBeNull()
        expect(log.oldHotLogIndex).toBeNull()
        expect(log.logLogIndex).toBeNull()
        expect(log.creating).toBe(false)
        expect(log.stopped).toBe(false)
    })

    it("should start with 0 entry count", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        expect(log.newHotLogEntryCount()).toBe(0)
        expect(log.oldHotLogEntryCount()).toBe(0)
        expect(log.logLogEntryCount()).toBe(0)
    })

    it("should track entry counts when entries are added", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        log.addNewHotLogEntry(new BinaryLogEntry(new Uint8Array([1])), 1, 0, 5)
        expect(log.newHotLogEntryCount()).toBe(1)

        log.addOldHotLogEntry(new BinaryLogEntry(new Uint8Array([2])), 2, 100, 5)
        expect(log.oldHotLogEntryCount()).toBe(1)
    })

    it("should report -1 as last entry number when no entries exist", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        expect(log.lastEntryNum()).toBe(-1)
    })

    it("should increase last entry number when entries added", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        log.addNewHotLogEntry(new BinaryLogEntry(new Uint8Array([1])), 1, 0, 5)
        expect(log.lastEntryNum()).toBe(1)

        log.addNewHotLogEntry(new BinaryLogEntry(new Uint8Array([2])), 2, 10, 5)
        expect(log.lastEntryNum()).toBe(2)
    })

    it("should move new index to old on moveNewToOldHotLog", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        log.addNewHotLogEntry(new BinaryLogEntry(new Uint8Array([1])), 1, 0, 5)
        expect(log.newHotLogEntryCount()).toBe(1)
        expect(log.oldHotLogEntryCount()).toBe(0)

        log.moveNewToOldHotLog()
        expect(log.newHotLogEntryCount()).toBe(0)
        expect(log.oldHotLogEntryCount()).toBe(1)
    })

    it("should stop the log and reflect stopped state", async () => {
        const server = createMockServer() as any
        const logId = await LogId.newRandom()
        const log = new Log(server, logId)

        expect(log.stopped).toBe(false)
        await log.stop()
        expect(log.stopped).toBe(true)
    })
})
