import { describe, expect, it, jest } from "@jest/globals"

import BinaryLogEntry from "./entry/binary-log-entry.js"
import CommandLogEntry from "./entry/command-log-entry.js"
import GlobalLogEntry from "./entry/global-log-entry.js"
import JSONLogEntry from "./entry/json-log-entry.js"
import LogId from "./log/log-id.js"
import Subscribe from "./subscribe.js"

function createMockServer() {
    return {
        uws: {
            publish: jest.fn<any>(),
        },
        getLog: jest.fn<any>().mockReturnValue({
            getConfig: jest.fn<any>().mockResolvedValue({}),
            access: {
                allowRead: jest.fn<any>().mockResolvedValue(true),
            },
        }),
    }
}

describe("Subscribe", () => {
    it("should add and check subscriptions", () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)

        expect(subscribe.hasSubscription("test-log")).toBe(false)
        subscribe.addSubscription("test-log")
        expect(subscribe.hasSubscription("test-log")).toBe(true)
    })

    it("should remove subscriptions", () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)

        subscribe.addSubscription("test-log")
        expect(subscribe.hasSubscription("test-log")).toBe(true)
        subscribe.delSubscription("test-log")
        expect(subscribe.hasSubscription("test-log")).toBe(false)
    })

    it("should allow subscription for readable log", async () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)
        const logId = await LogId.newRandom()

        const allowed = await subscribe.allowSubscription(logId)
        expect(allowed).toBe(true)
    })

    it("should publish JSON entry to subscribers", () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)
        const logId = new LogId(new Uint8Array(16))
        const logIdBase64 = logId.base64()

        subscribe.addSubscription(logIdBase64)

        const entry = new GlobalLogEntry({
            entryNum: 42,
            logId,
            entry: new JSONLogEntry({ jsonStr: '{"key":"value"}' }),
        })

        subscribe.publish(entry)
        expect(server.uws.publish).toHaveBeenCalledWith(logIdBase64, '{"entryNum":42,"entry":{"key":"value"}}', false)
    })

    it("should not publish if no subscribers", () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)

        const entry = new GlobalLogEntry({
            entryNum: 1,
            logId: new LogId(new Uint8Array(16)),
            entry: new JSONLogEntry({ jsonStr: '{"a":1}' }),
        })

        subscribe.publish(entry)
        expect(server.uws.publish).not.toHaveBeenCalled()
    })

    it("should publish command entry as empty object", () => {
        const server = createMockServer() as any
        const subscribe = new Subscribe(server)
        const logId = new LogId(new Uint8Array(16))
        const logIdBase64 = logId.base64()

        subscribe.addSubscription(logIdBase64)

        const entry = new GlobalLogEntry({
            entryNum: 10,
            logId,
            entry: new CommandLogEntry({
                commandNameU8: new Uint8Array([0]),
                commandValueU8: new Uint8Array([1, 2, 3]),
            }),
        })

        subscribe.publish(entry)
        expect(server.uws.publish).toHaveBeenCalledWith(logIdBase64, '{"entryNum":10,"entry":{}}', false)
    })
})

it("should publish binary entry as base64", () => {
    const server = createMockServer() as any
    const subscribe = new Subscribe(server)
    const logId = new LogId(new Uint8Array(16))
    const logIdBase64 = logId.base64()

    subscribe.addSubscription(logIdBase64)

    const binaryData = new Uint8Array([1, 2, 3, 4])
    const entry = new GlobalLogEntry({
        entryNum: 7,
        logId,
        entry: new BinaryLogEntry(binaryData),
    })

    subscribe.publish(entry)
    // Binary data should be base64 encoded in the JSON payload
    const base64Data = Buffer.from(binaryData).toString("base64")
    expect(server.uws.publish).toHaveBeenCalledWith(logIdBase64, `{"entryNum":7,"entry":"${base64Data}"}`, false)
})
