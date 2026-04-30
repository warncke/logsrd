import { describe, expect, it } from "@jest/globals"

import LogAddress from "./log-address.js"
import LogHost from "./log-host.js"

describe("LogAddress", () => {
    it("should create with logIdBase64 only", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.logIdBase64).toBe("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.host).toBeNull()
        expect(addr.config).toBeNull()
    })

    it("should create with logIdBase64 and host", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg", new LogHost("127.0.0.1:7000"))
        expect(addr.logIdBase64).toBe("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.host!.master).toBe("127.0.0.1:7000")
    })

    it("should set config", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg")
        addr.setConfig([new LogHost("127.0.0.1:7002", ["127.0.0.1:7003"])])
        expect(addr.config).toHaveLength(1)
        expect(addr.config![0].master).toBe("127.0.0.1:7002")
    })

    it("should set host", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg")
        addr.setHost(new LogHost("127.0.0.1:7000", ["127.0.0.1:7001"]))
        expect(addr.host!.master).toBe("127.0.0.1:7000")
        expect(addr.host!.replicas).toEqual(["127.0.0.1:7001"])
    })

    it("should convert to string with only logId", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.toString()).toBe("4Pn28fADU1jXYzJu0dtqhg")
    })

    it("should convert to string with host", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg", new LogHost("127.0.0.1:7000", ["127.0.0.1:7001"]))
        expect(addr.toString()).toBe("4Pn28fADU1jXYzJu0dtqhg;127.0.0.1:7000,127.0.0.1:7001")
    })

    it("should convert to string with host and config", () => {
        const addr = new LogAddress("4Pn28fADU1jXYzJu0dtqhg", new LogHost("127.0.0.1:7000", ["127.0.0.1:7001"]))
        addr.setConfig([new LogHost("127.0.0.1:7002", ["127.0.0.1:7003"])])
        expect(addr.toString()).toBe(
            "4Pn28fADU1jXYzJu0dtqhg;127.0.0.1:7000,127.0.0.1:7001;127.0.0.1:7002,127.0.0.1:7003",
        )
    })

    it("should parse full address from string", () => {
        const addr = LogAddress.fromString(
            "4Pn28fADU1jXYzJu0dtqhg;127.0.0.1:7000,127.0.0.1:7001;127.0.0.1:7002,127.0.0.1:7003",
        )
        expect(addr.logIdBase64).toBe("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.host!.master).toBe("127.0.0.1:7000")
        expect(addr.host!.replicas).toEqual(["127.0.0.1:7001"])
        expect(addr.config).toBeNull()
    })

    it("should parse address with only logId", () => {
        const addr = LogAddress.fromString("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.logIdBase64).toBe("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.host).toBeNull()
        expect(addr.config).toBeNull()
    })

    it("should throw on invalid short address", () => {
        expect(() => LogAddress.fromString("short")).toThrow("Invalid log address")
    })

    it("should parse address with multiple config hosts", () => {
        const addr = LogAddress.fromString(
            "4Pn28fADU1jXYzJu0dtqhg;127.0.0.1:7000,127.0.0.1:7001;127.0.0.1:7002,127.0.0.1:7003;127.0.0.1:7004,127.0.0.1:7005",
        )
        expect(addr.logIdBase64).toBe("4Pn28fADU1jXYzJu0dtqhg")
        expect(addr.host!.master).toBe("127.0.0.1:7000")
        expect(addr.config).not.toBeNull()
        expect(addr.config).toHaveLength(1)
        expect(addr.config![0].master).toBe("127.0.0.1:7002")
    })
})
