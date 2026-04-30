import { describe, expect, it, jest } from "@jest/globals"

import Replicate from "./replicate.js"
import GlobalLogEntry from "./entry/global-log-entry.js"
import BinaryLogEntry from "./entry/binary-log-entry.js"
import LogId from "./log/log-id.js"

function createMockServer() {
    return {
        config: {
            host: "127.0.0.1:7000",
            hosts: ["127.0.0.1:7000", "127.0.0.1:7001"],
            hostMonitorInterval: 10000,
            replicatePath: "/replicate",
            replicateTimeout: 3000,
            secret: "test-secret",
        },
    }
}

describe("Replicate", () => {
    it("should initialize with hosts from config excluding self", () => {
        const server = createMockServer() as any
        const replicate = new Replicate(server)

        expect(replicate.hosts.size).toBe(1)
        expect(replicate.hosts.has("127.0.0.1:7001")).toBe(true)
        expect(replicate.hosts.has("127.0.0.1:7000")).toBe(false)
    })

    it("should throw for unknown host", async () => {
        const server = createMockServer() as any
        const replicate = new Replicate(server)
        const logId = await LogId.newRandom()

        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId,
            entry: new BinaryLogEntry(new Uint8Array([1, 2, 3])),
        })

        await expect(
            replicate.appendReplica("unknown:9999", entry),
        ).rejects.toThrow("unknown host")
    })
})
