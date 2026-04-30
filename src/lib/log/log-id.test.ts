import { describe, expect, it } from "@jest/globals"

import LogId from "./log-id.js"

describe("LogId", () => {
    it("should create a random LogId of length 16", async () => {
        const id = await LogId.newRandom()
        expect(id.byteLength()).toBe(16)
    })

    it("should round-trip base64 encoding", async () => {
        const id = await LogId.newRandom()
        const b64 = id.base64()
        const decoded = LogId.newFromBase64(b64)
        expect(decoded.base64()).toBe(b64)
    })

    it("should derive a correct log-dir prefix", async () => {
        const id = await LogId.newRandom()
        const prefix = id.logDirPrefix()
        expect(prefix).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}$/)
    })

    it("should cache base64 on second call", async () => {
        const id = await LogId.newRandom()
        const b64 = id.base64()
        expect(id.base64()).toBe(b64)
    })

    it("should cache logDirPrefix on second call", async () => {
        const id = await LogId.newRandom()
        const prefix = id.logDirPrefix()
        expect(id.logDirPrefix()).toBe(prefix)
    })

    it("should return u8s array", async () => {
        const id = await LogId.newRandom()
        const u8s = id.u8s()
        expect(u8s).toHaveLength(1)
        expect(u8s[0]).toBe(id.logId)
    })

    it("should convert to JSON as base64", async () => {
        const id = await LogId.newRandom()
        expect(id.toJSON()).toBe(id.base64())
    })

    it("should create with base64 in constructor", () => {
        const u8 = new Uint8Array(16)
        const id = new LogId(u8, "test-base64")
        expect(id.base64()).toBe("test-base64")
    })
})
