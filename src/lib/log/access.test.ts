import { describe, expect, it, jest } from "@jest/globals"

import Access from "./access.js"

// We need to test the Access class by providing a mock log that returns configs
function createMockLog(config: any) {
    return {
        getConfig: jest.fn<any>().mockResolvedValue(config),
        config: null,
        access: null,
    }
}

describe("Access", () => {
    describe("token auth - public access", () => {
        const publicConfig = {
            logId: "test",
            type: "json",
            master: "127.0.0.1:7000",
            access: "public",
            authType: "token",
            stopped: false,
        }

        it("should allow read and write for null token on public log", async () => {
            const log = createMockLog(publicConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed(null)
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(true)
            expect(allowed.admin).toBe(false)
        })

        it("should allow read and write for empty token on public log", async () => {
            const log = createMockLog(publicConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("")
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(true)
        })

        it("should allow everything for superToken on public log", async () => {
            const log = createMockLog({ ...publicConfig, superToken: "super-secret" })
            const access = new Access(log as any)
            const allowed = await access.allowed("super-secret")
            expect(allowed.admin).toBe(true)
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(true)
        })
    })

    describe("token auth - private access", () => {
        const privateConfig = {
            logId: "test",
            type: "json",
            master: "127.0.0.1:7000",
            access: "private",
            authType: "token",
            accessToken: "base-access",
            adminToken: "admin-secret",
            readToken: "read-secret",
            writeToken: "write-secret",
            superToken: "super-secret",
            stopped: false,
        }

        it("should deny everything for null token on private log", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed(null)
            expect(allowed.read).toBe(false)
            expect(allowed.write).toBe(false)
            expect(allowed.admin).toBe(false)
        })

        it("should grant admin access with adminToken", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("admin-secret")
            expect(allowed.admin).toBe(true)
        })

        it("should grant read access with readToken", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("read-secret")
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(false)
            expect(allowed.admin).toBe(false)
        })

        it("should grant write access with writeToken", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("write-secret")
            expect(allowed.write).toBe(true)
            expect(allowed.read).toBe(false)
        })

        it("should grant full access with superToken", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("super-secret")
            expect(allowed.admin).toBe(true)
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(true)
        })

        it("should deny access for invalid token", async () => {
            const log = createMockLog(privateConfig)
            const access = new Access(log as any)
            const allowed = await access.allowed("invalid-token")
            expect(allowed.read).toBe(false)
            expect(allowed.write).toBe(false)
            expect(allowed.admin).toBe(false)
        })
    })

    describe("token auth - readOnly access", () => {
        it("should only allow read for null token on readOnly log", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "readOnly",
                authType: "token",
                stopped: false,
            })
            const access = new Access(log as any)
            const allowed = await access.allowed(null)
            expect(allowed.read).toBe(true)
            expect(allowed.write).toBe(false)
        })
    })

    describe("token auth - writeOnly access", () => {
        it("should only allow write for null token on writeOnly log", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "writeOnly",
                authType: "token",
                stopped: false,
            })
            const access = new Access(log as any)
            const allowed = await access.allowed(null)
            expect(allowed.read).toBe(false)
            expect(allowed.write).toBe(true)
        })
    })

    describe("JWT auth", () => {
        it("should deny all for null token on JWT log", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "private",
                authType: "jwt",
                jwtSecret: "dGVzdC1zZWNyZXQ=",
                stopped: false,
            })
            const access = new Access(log as any)
            const allowed = await access.allowed(null)
            expect(allowed.read).toBe(false)
            expect(allowed.write).toBe(false)
            expect(allowed.admin).toBe(false)
        })
    })

    describe("helper methods", () => {
        it("allowAdmin should return admin status", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "private",
                authType: "token",
                adminToken: "admin-secret",
                stopped: false,
            })
            const access = new Access(log as any)
            expect(await access.allowAdmin("admin-secret")).toBe(true)
            expect(await access.allowAdmin("wrong-token")).toBe(false)
        })

        it("allowRead should return read status", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            })
            const access = new Access(log as any)
            expect(await access.allowRead(null)).toBe(true)
        })

        it("allowWrite should return write status", async () => {
            const log = createMockLog({
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            })
            const access = new Access(log as any)
            expect(await access.allowWrite(null)).toBe(true)
        })
    })
})
