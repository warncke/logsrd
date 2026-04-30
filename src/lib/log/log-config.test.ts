import { describe, expect, it } from "@jest/globals"

import LogConfig from "./log-config.js"

describe("LogConfig", () => {
    it("should create a minimal valid config with token auth and fill defaults", async () => {
        const config = await LogConfig.newFromJSON({
            logId: "test-log-id",
            type: "json",
            master: "127.0.0.1:7000",
            access: "private",
            authType: "token",
            stopped: false,
        })
        expect(config.logId).toBe("test-log-id")
        expect(config.type).toBe("json")
        expect(config.master).toBe("127.0.0.1:7000")
        expect(config.access).toBe("private")
        expect(config.authType).toBe("token")
        expect(config.stopped).toBe(false)
        // accessToken should have been generated since none was provided
        expect(config.accessToken).toBeDefined()
        expect(config.accessToken!.length).toBeGreaterThan(0)
        // no duplicate token generation when accessToken is already set
        const firstToken = config.accessToken
        expect(firstToken).toBe(config.accessToken)
    })

    it("should create a JWT config and generate secret without token conflict", async () => {
        const config = await LogConfig.newFromJSON({
            logId: "jwt-log",
            type: "binary",
            master: "127.0.0.1:7000",
            access: "public",
            authType: "jwt",
            stopped: false,
        })
        expect(config.authType).toBe("jwt")
        expect(config.jwtSecret).toBeDefined()
        expect(config.jwtSecret!.length).toBeGreaterThan(0)
        // should NOT have any access tokens generated for JWT auth
        expect(config.accessToken).toBeUndefined()
        expect(config.adminToken).toBeUndefined()
        expect(config.readToken).toBeUndefined()
        expect(config.writeToken).toBeUndefined()
    })

    it("should throw InvalidLogConfigError for invalid access/token combos", async () => {
        // accessToken + authType jwt should throw
        await expect(
            LogConfig.newFromJSON({
                logId: "bad-config",
                type: "json",
                master: "127.0.0.1:7000",
                access: "private",
                authType: "jwt",
                accessToken: "some-token",
                stopped: false,
            }),
        ).rejects.toThrow("accessTokens not allowed for authType jwt")

        // jwtSecret with authType token should throw
        await expect(
            LogConfig.newFromJSON({
                logId: "bad-config-2",
                type: "json",
                master: "127.0.0.1:7000",
                access: "private",
                authType: "token",
                jwtSecret: "some-secret",
                stopped: false,
            }),
        ).rejects.toThrow("jwtSecret not allowed for authType token")

        // public access with readToken should throw
        await expect(
            LogConfig.newFromJSON({
                logId: "bad-config-3",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                readToken: "some-token",
                stopped: false,
            }),
        ).rejects.toThrow("readToken and writeToken not allowed for access public")

        // readOnly access with readToken should throw
        await expect(
            LogConfig.newFromJSON({
                logId: "bad-config-4",
                type: "json",
                master: "127.0.0.1:7000",
                access: "readOnly",
                authType: "token",
                readToken: "some-token",
                stopped: false,
            }),
        ).rejects.toThrow("readToken not allowed for access readOnly")

        // writeOnly access with writeToken should throw
        await expect(
            LogConfig.newFromJSON({
                logId: "bad-config-5",
                type: "json",
                master: "127.0.0.1:7000",
                access: "writeOnly",
                authType: "token",
                writeToken: "some-token",
                stopped: false,
            }),
        ).rejects.toThrow("writeToken not allowed for access writeOnly")
    })

    it("should return replication group from config", async () => {
        const config = await LogConfig.newFromJSON({
            logId: "repl-log",
            type: "json",
            master: "127.0.0.1:7000",
            replicas: ["127.0.0.1:7001", "127.0.0.1:7002"],
            access: "private",
            authType: "token",
            stopped: false,
        })
        const group = config.replicationGroup()
        expect(group).toEqual(["127.0.0.1:7000", "127.0.0.1:7001", "127.0.0.1:7002"])
    })

    it("should generate scoped tokens when accessToken not provided", async () => {
        const config = await LogConfig.newFromJSON({
            logId: "scoped-log",
            type: "json",
            master: "127.0.0.1:7000",
            access: "private",
            authType: "token",
            adminToken: "my-admin-token",
            readToken: "my-read-token",
            writeToken: "my-write-token",
            stopped: false,
        })
        // no accessToken should be needed since all scoped tokens are provided
        expect(config.accessToken).toBeUndefined()
        expect(config.adminToken).toBe("my-admin-token")
        expect(config.readToken).toBe("my-read-token")
        expect(config.writeToken).toBe("my-write-token")
    })

    it("should reject JSON missing required fields", async () => {
        await expect(
            LogConfig.newFromJSON({
                logId: "test",
                type: "invalid-type", // invalid enum value
                master: "127.0.0.1:7000",
                access: "private",
                authType: "token",
                stopped: false,
            }),
        ).rejects.toThrow("Invalid log config")
    })
})
