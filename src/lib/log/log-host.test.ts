import { describe, expect, it } from "@jest/globals"

import LogHost from "./log-host.js"

describe("LogHost", () => {
    it("should create a LogHost with master and replicas", () => {
        const host = new LogHost("127.0.0.1:7000", ["127.0.0.1:7001", "127.0.0.1:7002"])
        expect(host.master).toBe("127.0.0.1:7000")
        expect(host.replicas).toEqual(["127.0.0.1:7001", "127.0.0.1:7002"])
    })

    it("should create a LogHost with empty replicas by default", () => {
        const host = new LogHost("127.0.0.1:7000")
        expect(host.master).toBe("127.0.0.1:7000")
        expect(host.replicas).toEqual([])
    })

    it("should parse from string", () => {
        const host = LogHost.fromString("127.0.0.1:7000,127.0.0.1:7001,127.0.0.1:7002")
        expect(host.master).toBe("127.0.0.1:7000")
        expect(host.replicas).toEqual(["127.0.0.1:7001", "127.0.0.1:7002"])
    })

    it("should parse single host string", () => {
        const host = LogHost.fromString("127.0.0.1:7000")
        expect(host.master).toBe("127.0.0.1:7000")
        expect(host.replicas).toEqual([])
    })

    it("should convert to string", () => {
        const host = new LogHost("127.0.0.1:7000", ["127.0.0.1:7001"])
        expect(host.toString()).toBe("127.0.0.1:7000,127.0.0.1:7001")
    })

    it("should convert single host to string", () => {
        const host = new LogHost("127.0.0.1:7000")
        expect(host.toString()).toBe("127.0.0.1:7000")
    })
})
