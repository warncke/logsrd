import { describe, expect, it, jest } from "@jest/globals"

import BinaryLogEntry from "../entry/binary-log-entry.js"
import GlobalLogEntry from "../entry/global-log-entry.js"
import LogId from "../log/log-id.js"
import AppendReplica from "./append-replica.js"

describe("AppendReplica", () => {
    it("should initialize with host and entry", async () => {
        const host = { host: "127.0.0.1:7001" } as any
        const logId = await LogId.newRandom()
        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1])),
        })

        const ar = new AppendReplica(host, entry)
        expect(ar.host).toBe(host)
        expect(ar.entry).toBe(entry)
        expect(ar.sent).toBe(false)
        expect(ar.start).toBeGreaterThan(0)
    })

    it("should resolve promise on complete", async () => {
        const host = { host: "127.0.0.1:7001" } as any
        const logId = await LogId.newRandom()
        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1])),
        })

        const ar = new AppendReplica(host, entry)
        ar.complete()
        await expect(ar.promise).resolves.toBeUndefined()
    })

    it("should reject promise on completeWithError", async () => {
        const host = { host: "127.0.0.1:7001" } as any
        const logId = await LogId.newRandom()
        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1])),
        })

        const ar = new AppendReplica(host, entry)
        ar.completeWithError(new Error("test error"))
        await expect(ar.promise).rejects.toThrow("test error")
    })

    it("should reject promise on timeout", async () => {
        const host = { host: "127.0.0.1:7001" } as any
        const logId = await LogId.newRandom()
        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1])),
        })

        const ar = new AppendReplica(host, entry)
        ar.timeout()
        await expect(ar.promise).rejects.toThrow("Replicate timeout")
    })

    it("should handle complete with null resolve via retry", () => {
        jest.useFakeTimers()
        const host = { host: "127.0.0.1:7001" } as any
        const logId = new (require("../log/log-id.js").default)() as any
        // We need a simpler approach - just test the timeout method is called
        const ar = new AppendReplica(host, {} as any)
        // Override resolve to null to test the retry path
        ;(ar as any).resolve = null
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
        ar.complete()
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
        jest.useRealTimers()
    })

    it("should handle completeWithError with null reject via retry", () => {
        jest.useFakeTimers()
        const host = { host: "127.0.0.1:7001" } as any
        const logId = new (require("../log/log-id.js").default)() as any
        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1])),
        })
        const ar = new AppendReplica(host, entry)
        ;(ar as any).reject = null
        const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {})
        ar.completeWithError(new Error("test error"))
        expect(consoleSpy).toHaveBeenCalled()
        consoleSpy.mockRestore()
        jest.useRealTimers()
    })
})
