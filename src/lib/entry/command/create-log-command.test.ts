import { describe, expect, it } from "@jest/globals"

import CreateLogCommand from "./create-log-command.js"

describe("CreateLogCommand", () => {
    it("should create with value", () => {
        const cmd = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const val = cmd.value()
        expect(val.logId).toBe("test")
        expect(val.type).toBe("json")
    })

    it("should create with commandValueU8", () => {
        const cmd = new CreateLogCommand({
            commandValueU8: new TextEncoder().encode(
                JSON.stringify({
                    logId: "test",
                    type: "json",
                    master: "127.0.0.1:7000",
                    access: "public",
                    authType: "token",
                    stopped: false,
                }),
            ),
        })
        const val = cmd.value()
        expect(val.logId).toBe("test")
    })

    it("should create with explicit commandNameU8", () => {
        const cmd = new CreateLogCommand({
            commandNameU8: new Uint8Array([0]),
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const val = cmd.value()
        expect(val.logId).toBe("test")
    })
})
