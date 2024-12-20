import fs from "node:fs/promises"
import path from "path"

import JSONCommandType from "../entry/command/command-type/json-command-type"
import CreateLogCommand from "../entry/command/create-log-command"
import GlobalLogEntry from "../entry/global-log-entry"
import LogEntry from "../entry/log-entry"
import LogLogEntry from "../entry/log-log-entry"
import LogConfig from "../log-config"
import LogId from "../log-id"
import Persist from "../persist"
import GlobalLogIndex from "./global-log-index"
import ReadConfigIOOperation from "./io/read-config-io-operation"
import ReadHeadIOOperation from "./io/read-head-io-operation"
import WriteIOOperation from "./io/write-io-operation"
import LogLogIndex from "./log-log-index"
import PersistLogStats from "./persist-log-stats"

export default class PersistLog {
    persist: Persist
    logId: LogId
    coldLogIndex: GlobalLogIndex | null = null
    newHotLogIndex: GlobalLogIndex | null = null
    oldHotLogIndex: GlobalLogIndex | null = null
    logLogIndex: LogLogIndex | null = null
    creating: boolean = false
    stats: PersistLogStats = new PersistLogStats()
    config: LogConfig | null = null

    constructor(persist: Persist, logId: LogId) {
        this.persist = persist
        this.logId = logId
    }

    async append(entry: LogEntry): Promise<GlobalLogEntry | LogLogEntry> {
        let op = new WriteIOOperation(entry, this.logId)
        this.persist.newHotLog.enqueueIOp(op)
        this.stats.addOp(op)
        op = await op.promise
        if (op.entry instanceof GlobalLogEntry || op.entry instanceof LogLogEntry) {
            return op.entry
        } else {
            throw new Error("Invalid entry type")
        }
    }

    async create(config: LogConfig) {
        if (this.creating) {
            throw new Error("already creating")
        }
        if (await this.exists()) {
            throw new Error("already exists")
        }
        this.creating = true
        const entry = new CreateLogCommand({ value: config })
        let op = new WriteIOOperation(entry, this.logId)
        this.persist.newHotLog.enqueueIOp(op)
        try {
            op = await op.promise
        } catch (err) {
            throw err
        } finally {
            this.creating = false
        }
        this.stats.addOp(op)
        this.config = config
    }

    async exists(): Promise<boolean> {
        if (
            this.coldLogIndex !== null ||
            this.newHotLogIndex !== null ||
            this.oldHotLogIndex !== null ||
            this.logLogIndex !== null
        ) {
            return true
        }
        try {
            await fs.stat(this.filename())
            return true
        } catch (_err) {
            return false
        }
    }

    async getConfig(): Promise<LogConfig> {
        if (this.config !== null) {
            return this.config
        }
        let op = new ReadConfigIOOperation(this.logId)
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
            this.persist.newHotLog.enqueueIOp(op)
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            this.persist.oldHotLog.enqueueIOp(op)
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasConfig()) {
            this.persist.coldLog.enqueueIOp(op)
        } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            throw new Error("Not implemented")
        } else {
            throw new Error("Not implemented")
        }
        op = await op.promise
        this.stats.addOp(op)
        if (op.entry === null) {
            throw new Error("entry is null")
        }
        if (op.entry.entry instanceof JSONCommandType) {
            this.config = new LogConfig(op.entry.entry.value())
        } else {
            throw new Error("Invalid entry type for config")
        }
        return this.config
    }

    getLastGlobalConfig(): [number, number, number] {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
            return this.newHotLogIndex.lastConfig()
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            return this.oldHotLogIndex.lastConfig()
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasConfig()) {
            return this.coldLogIndex.lastConfig()
        } else {
            // when compacting need to make sure there are no outstanding read ops
            throw new Error("No global config")
        }
    }

    getLastGlobalEntry(): [number, number, number] {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            return this.newHotLogIndex.lastEntry()
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            return this.oldHotLogIndex.lastEntry()
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasEntries()) {
            return this.coldLogIndex.lastEntry()
        } else {
            // when compacting need to make sure there are no outstanding read ops
            throw new Error("No global entries")
        }
    }

    async getHead(): Promise<GlobalLogEntry | LogLogEntry> {
        let op = new ReadHeadIOOperation(this.logId)
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            this.persist.newHotLog.enqueueIOp(op)
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            this.persist.oldHotLog.enqueueIOp(op)
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasEntries()) {
            this.persist.coldLog.enqueueIOp(op)
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            throw new Error("Not implemented")
        } else {
            throw new Error("Not implemented")
        }
        op = await op.promise
        this.stats.addOp(op)
        if (op.entry === null) {
            throw new Error("entry is null")
        }
        return op.entry
    }

    async getEntries(
        entryNums: number[],
        offset?: number,
        limit?: number,
    ): Promise<Array<GlobalLogEntry | LogLogEntry>> {
        return []
    }

    maxEntryNum(): number {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            return this.newHotLogIndex.maxEntryNum()
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            return this.oldHotLogIndex.maxEntryNum()
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasEntries()) {
            return this.coldLogIndex.maxEntryNum()
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return this.logLogIndex.maxEntryNum()
        } else {
            // if there are no entries return -1 so this will be incremented to zero for the first entry
            return -1
        }
    }

    addNewHotLogEntry(entry: LogEntry, entryNum: number, globalOffset: number, length: number) {
        if (this.newHotLogIndex === null) {
            this.newHotLogIndex = new GlobalLogIndex()
        }
        this.newHotLogIndex.addEntry(entry, entryNum, globalOffset, length)
    }

    addOldHotLogEntry(entry: LogEntry, entryNum: number, globalOffset: number, length: number) {
        if (this.oldHotLogIndex === null) {
            this.oldHotLogIndex = new GlobalLogIndex()
        }
        this.oldHotLogIndex.addEntry(entry, entryNum, globalOffset, length)
    }

    addColdLogEntry(entry: LogEntry, entryNum: number, globalOffset: number, length: number) {
        if (this.coldLogIndex === null) {
            this.coldLogIndex = new GlobalLogIndex()
        }
        this.coldLogIndex.addEntry(entry, entryNum, globalOffset, length)
    }

    filename() {
        return path.join(this.persist.config.logDir!, this.logId.logDirPrefix(), `${this.logId.base64()}.log`)
    }
}
