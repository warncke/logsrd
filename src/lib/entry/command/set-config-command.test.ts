import { describe, expect, it } from "@jest/globals"

import SetConfigCommand from "./set-config-command.js"

describe("SetConfigCommand", () => {
    it("should create with value", () => {
        const cmd = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        expect(cmd.value()).toHaveProperty("logId", "test")
    })

    it("should create with explicit commandNameU8", () => {
        const cmd = new SetConfigCommand({
            commandNameU8: new Uint8Array([1]),
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        expect(cmd.value()).toHaveProperty("logId", "test")
    })
})
