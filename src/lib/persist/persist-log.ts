import fs from "node:fs/promises"
import path from "path"

import BinaryLogEntry from "../entry/binary-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import JSONLogEntry from "../entry/json-log-entry"
import LogConfig from "../log-config"
import LogEntry from "../log-entry"
import LogId from "../log-id"
import Persist from "../persist"
import GlobalLogIndex from "./global-log-index"
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

    async append(entry: LogEntry) {}

    async create(config: LogConfig) {
        if (this.creating) {
            throw new Error("already creating")
        }
        if (await this.exists()) {
            throw new Error("already exists")
        }
        this.creating = true
        const entry = new CreateLogCommand({ value: config })
        const iOp = new WriteIOOperation(entry, this.logId)
        this.persist.newHotLog.enqueueIOp(iOp)
        await iOp.promise.catch((err) => {
            this.creating = false
            throw err
        })
        this.stats.addIOp(iOp)
        this.config = config
        this.creating = false
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
        } else {
            throw new Error("Log does not exist")
        }
        // else if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
        // } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
        // } else if (this.coldLogIndex !== null && this.coldLogIndex.hasConfig()) {
        // } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
        // } else {
        //     return null
        // }
    }

    async getHead(): Promise<JSONLogEntry | BinaryLogEntry | null> {
        throw new Error("Not implemented")
    }

    maxEntryNum(): number {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasAnyEntries()) {
            return this.newHotLogIndex.maxEntryNum()
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasAnyEntries()) {
            return this.oldHotLogIndex.maxEntryNum()
        } else if (this.coldLogIndex !== null && this.coldLogIndex.hasAnyEntries()) {
            return this.coldLogIndex.maxEntryNum()
        } else if (this.logLogIndex !== null && this.logLogIndex.hasAnyEntries()) {
            return this.logLogIndex.maxEntryNum()
        } else {
            return 0
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
