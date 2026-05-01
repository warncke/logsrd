import { describe, expect, it, jest } from "@jest/globals"
import fs from "node:fs/promises"
import path from "node:path"
import os from "node:os"

import BinaryLogEntry from "./entry/binary-log-entry"
import GlobalLogEntry from "./entry/global-log-entry"
import LogId from "./log/log-id"
import Server from "./server.js"

function createMockUws(): { publish: jest.Mock } {
    return {
        publish: jest.fn<any>(),
    }
}

let tmpDir: string

function createMinimalConfig() {
    return {
        host: "127.0.0.1:7000",
        dataDir: tmpDir,
        pageSize: 4096,
        globalIndexCountLimit: 100_000,
        globalIndexSizeLimit: 1024 * 1024 * 100,
        hosts: [],
        hostMonitorInterval: 10000,
        replicatePath: "/replicate",
        replicateTimeout: 3000,
        secret: "test-secret",
    }
}

describe("Server", () => {
    beforeAll(async () => {
        tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "logsrd-server-test-"))
    })

    afterAll(async () => {
        await fs.rm(tmpDir, { recursive: true, force: true })
    })
    it("should initialize with config and uws", () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)

        expect(server.config).toBe(config)
        expect(server.uws).toBe(uws)
        expect(server.logs.size).toBe(0)
    })

    it("should get or create a log via getLog", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)
        const logId = await LogId.newRandom()

        const log = server.getLog(logId)
        expect(log.logId.base64()).toBe(logId.base64())
        expect(server.logs.size).toBe(1)
        expect(server.getLog(logId)).toBe(log)
    })

    it("should delete a log via delLog", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)
        const logId = await LogId.newRandom()

        server.getLog(logId)
        expect(server.logs.size).toBe(1)
        server.delLog(logId)
        expect(server.logs.size).toBe(0)
    })

    it("should throw when appending to unknown master", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)
        const logId = await LogId.newRandom()

        // Log exists but has no config yet - appendLog will try to getConfig
        await expect(server.appendLog(logId, null, new Uint8Array([1, 2, 3]), null)).rejects.toThrow()
    })

    it("should throw when creating log with existing logId", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)

        await expect(server.createLog({ logId: "preexisting-id" })).rejects.toThrow("Setting logId not allowed")
    })

    it("should attempt to create a log when data dir exists", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)

        // With a real temp dir, createLog should succeed
        const entry = await server.createLog({
            type: "json",
            access: "public",
            authType: "token",
            stopped: false,
        })
        expect(entry).toBeDefined()
        expect(entry.entryNum).toBe(0)
    })

    it("should reject appendReplica for unknown log without CreateLogCommand", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)
        const logId = await LogId.newRandom()
        const inner = new BinaryLogEntry(new Uint8Array([1, 2, 3]))
        const entry = new GlobalLogEntry({ entryNum: 0, logId, entry: inner })

        // AppendReplica for a non-CreateLogCommand on unknown log should try to get config and fail
        await expect(server.appendReplica(entry)).rejects.toThrow()
    })

    it("should return false from deleteLog (not implemented)", async () => {
        const config = createMinimalConfig()
        const uws = createMockUws() as any
        const server = new Server(config, uws)
        const logId = await LogId.newRandom()

        const result = await server.deleteLog(logId)
        expect(result).toBe(false)
    })
})
