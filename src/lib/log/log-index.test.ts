import { describe, expect, it } from "@jest/globals"

import CreateLogCommand from "../entry/command/create-log-command.js"
import SetConfigCommand from "../entry/command/set-config-command.js"
import LogIndex from "./log-index.js"

describe("LogIndex", () => {
    it("should start empty", () => {
        const index = new LogIndex()
        expect(index.entryCount()).toBe(0)
        expect(index.hasEntries()).toBe(false)
    })

    it("should add entries and track count", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 0, 100)
        expect(index.entryCount()).toBe(1)
        expect(index.hasEntries()).toBe(true)
    })

    it("should retrieve entry by number", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        const result = index.entry(0)
        expect(result).toEqual([0, 10, 50])
    })

    it("should throw on missing entry", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        expect(() => index.entry(5)).toThrow("entry not in index")
    })

    it("should track last config for CreateLogCommand", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        expect(index.hasConfig()).toBe(true)
        expect(index.lastConfig()).toEqual([0, 10, 50])
        expect(index.lastConfigEntryNum()).toBe(0)
    })

    it("should track last config for SetConfigCommand", () => {
        const index = new LogIndex()
        const entry = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 5, 20, 60)
        expect(index.hasConfig()).toBe(true)
        expect(index.lastConfig()).toEqual([5, 20, 60])
    })

    it("should update config when newer entry is added", () => {
        const index = new LogIndex()
        const createEntry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const setConfigEntry = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7001",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(createEntry, 0, 10, 50)
        index.addEntry(setConfigEntry, 1, 60, 70)
        expect(index.lastConfig()).toEqual([1, 60, 70])
    })

    it("should not update config when older entry is added", () => {
        const index = new LogIndex()
        const setConfigEntry = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7001",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const createEntry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(setConfigEntry, 5, 20, 60)
        index.addEntry(createEntry, 3, 10, 50)
        expect(index.lastConfig()).toEqual([5, 20, 60])
    })

    it("should throw on lastConfig when no config exists", () => {
        const index = new LogIndex()
        expect(() => index.lastConfig()).toThrow("no last config")
    })

    it("should throw on lastConfigEntryNum when no config exists", () => {
        const index = new LogIndex()
        expect(() => index.lastConfigEntryNum()).toThrow("no last config")
    })

    it("should return last entry", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        index.addEntry(entry, 1, 60, 70)
        expect(index.lastEntry()).toEqual([1, 60, 70])
    })

    it("should throw on lastEntry when no entries", () => {
        const index = new LogIndex()
        expect(() => index.lastEntry()).toThrow("no last entry")
    })

    it("should return max entry number", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        index.addEntry(entry, 5, 60, 70)
        expect(index.maxEntryNum()).toBe(5)
    })

    it("should throw on maxEntryNum when no entries", () => {
        const index = new LogIndex()
        expect(() => index.maxEntryNum()).toThrow("no entries")
    })

    it("should append another index", () => {
        const index1 = new LogIndex()
        const index2 = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index1.addEntry(entry, 0, 10, 50)
        index2.addEntry(entry, 1, 60, 70)
        index1.appendIndex(index2)
        expect(index1.entryCount()).toBe(2)
        expect(index1.entry(1)).toEqual([1, 60, 70])
    })

    it("should update config when appended index has newer config", () => {
        const index1 = new LogIndex()
        const index2 = new LogIndex()
        const createEntry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const setConfigEntry = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7001",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index1.addEntry(createEntry, 0, 10, 50)
        index2.addEntry(setConfigEntry, 5, 60, 70)
        index1.appendIndex(index2)
        expect(index1.lastConfig()).toEqual([5, 60, 70])
    })

    it("should not update config when appended index has older config", () => {
        const index1 = new LogIndex()
        const index2 = new LogIndex()
        const setConfigEntry = new SetConfigCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7001",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        const createEntry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index1.addEntry(setConfigEntry, 5, 60, 70)
        index2.addEntry(createEntry, 0, 10, 50)
        index1.appendIndex(index2)
        expect(index1.lastConfig()).toEqual([5, 60, 70])
    })

    it("should calculate byte length", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 0, 100)
        expect(index.byteLength(27)).toBe(73)
    })

    it("should return entries array", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 0, 10, 50)
        expect(index.entries()).toEqual([0, 10, 50])
    })

    it("should check hasEntry correctly", () => {
        const index = new LogIndex()
        const entry = new CreateLogCommand({
            value: {
                logId: "test",
                type: "json",
                master: "127.0.0.1:7000",
                access: "public",
                authType: "token",
                stopped: false,
            },
        })
        index.addEntry(entry, 5, 10, 50)
        expect(index.hasEntry(5)).toBe(true)
        expect(index.hasEntry(3)).toBe(false)
        expect(index.hasEntry(7)).toBe(false)
    })
})
