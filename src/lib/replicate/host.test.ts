import { describe, expect, it, jest } from "@jest/globals"

describe("Host", () => {
    it("should initialize with host name and replicate ref", () => {
        jest.useFakeTimers()
        const Host = require("./host.js").default
        const replicate = {
            server: {
                config: {
                    hostMonitorInterval: 10000,
                    replicateTimeout: 3000,
                    secret: "test-secret",
                    host: "127.0.0.1:7000",
                },
            },
        } as any

        const host = new Host(replicate, "127.0.0.1:7001")
        expect(host.host).toBe("127.0.0.1:7001")
        expect(host.replicate).toBe(replicate)
        jest.useRealTimers()
    })
})
