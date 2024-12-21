import fs from "node:fs/promises"
import path from "path"

import JSONCommandType from "../entry/command/command-type/json-command-type"
import CreateLogCommand from "../entry/command/create-log-command"
import GlobalLogEntry from "../entry/global-log-entry"
import LogEntry from "../entry/log-entry"
import LogLogEntry from "../entry/log-log-entry"
import { GLOBAL_LOG_PREFIX_BYTE_LENGTH, LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import LogConfig from "../log-config"
import LogId from "../log-id"
import Persist from "../persist"
import GlobalLogIndex from "./global-log-index"
import ReadConfigIOOperation from "./io/read-config-io-operation"
import ReadEntriesIOOperation from "./io/read-entries-io-operation"
import ReadHeadIOOperation from "./io/read-head-io-operation"
import WriteIOOperation from "./io/write-io-operation"
import LogLogIndex from "./log-log-index"
import PersistLogStats from "./persist-log-stats"
import LogLog from "./persisted-log/log-log"
import PersistedLog from "./persisted-log/persisted-log"

export default class PersistLog {
    persist: Persist
    logId: LogId
    coldLogIndex: GlobalLogIndex | null = null
    newHotLogIndex: GlobalLogIndex | null = null
    oldHotLogIndex: GlobalLogIndex | null = null
    logLogIndex: LogLogIndex | null = null
    logLog: LogLog | null = null
    creating: boolean = false
    stats: PersistLogStats = new PersistLogStats()
    config: LogConfig | null = null

    constructor(persist: Persist, logId: LogId) {
        this.persist = persist
        this.logId = logId
    }

    async getLog(): Promise<LogLog> {
        if (this.logLog === null) {
            this.logLog = new LogLog({
                config: await this.getConfig(),
                persist: this.persist,
                persistLog: this,
            })
            await this.logLog.init()
        }
        return this.logLog
    }

    async appendOp(target: PersistedLog, entry: LogEntry): Promise<WriteIOOperation> {
        let op = new WriteIOOperation(entry, this.logId)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    async readEntriesOp(target: PersistedLog, entryNums: number[]): Promise<ReadEntriesIOOperation> {
        let op = new ReadEntriesIOOperation(this.logId, entryNums)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    moveNewToOldHotLog() {
        this.oldHotLogIndex = this.newHotLogIndex
        this.newHotLogIndex = null
    }

    async emptyOldHotLog(): Promise<void> {
        if (this.oldHotLogIndex === null || !this.oldHotLogIndex.hasEntries()) {
            return
        }
        // make sure LogLog is initialized
        await this.getLog()
        const oldEntries = this.oldHotLogIndex.entries()
        const moveEntries = []
        let entryByteLength = 0
        const coldLogMaxEntryNum =
            this.logLogIndex !== null && this.logLogIndex.hasEntries() ? this.logLogIndex.maxEntryNum() : -1
        const logLogMaxEntryNum =
            this.logLogIndex !== null && this.logLogIndex.hasEntries() ? this.logLogIndex.maxEntryNum() : -1

        for (let i = 0; i + 2 < oldEntries.length; i += 3) {
            const entryNum = oldEntries[i]
            const offset = oldEntries[i + 1]
            const length = oldEntries[i + 2]
            // skip entries that are already persisted to cold or log logs
            if (entryNum <= coldLogMaxEntryNum || entryNum <= logLogMaxEntryNum) {
                continue
            }
            moveEntries.push(entryNum)
            entryByteLength += length - GLOBAL_LOG_PREFIX_BYTE_LENGTH + LOG_LOG_PREFIX_BYTE_LENGTH
        }
        // if there is nothing to move then remove index and finish
        if (moveEntries.length === 0) {
            this.oldHotLogIndex = null
            return
        }
        // TODO: make this incremental if there are a large number of entries
        const op = await this.readEntriesOp(this.persist.oldHotLog, moveEntries)
        if (op.entries === null) {
            throw new Error("entries is null")
        }
        // if there is at least pageSize of entries move to log log
        if (entryByteLength > this.persist.config.pageSize) {
            const ops = []
            for (const entry of op.entries) {
                ops.push(this.appendOp(this.logLog!, entry.entry))
            }
            await Promise.all(ops)
        }
        // otherwise move to cold log
        else {
            const ops = []
            for (const entry of op.entries) {
                ops.push(this.appendOp(this.persist.coldLog, entry.entry))
            }
            await Promise.all(ops)
        }
        // get/delete any current ops queued for old hot log
        const logQueue = this.persist.oldHotLog.ioQueue.deleteLogQueue(this.logId)
        if (logQueue !== null) {
            while (logQueue.opPending()) {
                const [reads] = logQueue.getReady()
                for (const read of reads) {
                    this.logLog!.enqueueOp(read)
                }
            }
        }
        // wait for any ioInProgress on old hot log to complete
        await this.persist.oldHotLog.waitInProgress()
        this.oldHotLogIndex = null
    }

    async append(entry: LogEntry): Promise<GlobalLogEntry | LogLogEntry> {
        const op = await this.appendOp(this.persist.newHotLog, entry)
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
        try {
            const op = this.appendOp(this.persist.newHotLog, entry)
            this.config = config
        } catch (err) {
            throw err
        } finally {
            this.creating = false
        }
    }

    async exists(): Promise<boolean> {
        if (
            this.logLogIndex !== null ||
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
            this.persist.newHotLog.enqueueOp(op)
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            this.persist.oldHotLog.enqueueOp(op)
        } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            this.persist.coldLog.enqueueOp(op)
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
        } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            return this.logLogIndex.lastConfig()
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
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return this.logLogIndex.lastEntry()
        } else {
            // when compacting need to make sure there are no outstanding read ops
            throw new Error("No global entries")
        }
    }

    lastLogConfigOffset(): number {
        // assume actual log file will always have a CreateLogCommand as the first entry
        if (this.logLogIndex === null || !this.logLogIndex.hasConfig()) {
            return 0
        }
        return this.logLogIndex.lcOff!
    }

    async getHead(): Promise<GlobalLogEntry | LogLogEntry> {
        let op = new ReadHeadIOOperation(this.logId)
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            this.persist.newHotLog.enqueueOp(op)
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            this.persist.oldHotLog.enqueueOp(op)
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            this.persist.coldLog.enqueueOp(op)
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
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return this.logLogIndex.maxEntryNum()
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return this.logLogIndex.maxEntryNum()
        } else {
            // if there are no entries return -1 so this will be incremented to zero for the first entry
            return -1
        }
    }

    addNewHotLogEntry(entry: LogEntry, entryNum: number, entryOffset: number, length: number) {
        if (this.newHotLogIndex === null) {
            this.newHotLogIndex = new GlobalLogIndex()
        }
        this.newHotLogIndex.addEntry(entry, entryNum, entryOffset, length)
    }

    addOldHotLogEntry(entry: LogEntry, entryNum: number, entryOffset: number, length: number) {
        if (this.oldHotLogIndex === null) {
            this.oldHotLogIndex = new GlobalLogIndex()
        }
        this.oldHotLogIndex.addEntry(entry, entryNum, entryOffset, length)
    }

    addColdLogEntry(entry: LogEntry, entryNum: number, entryOffset: number, length: number) {
        if (this.logLogIndex === null) {
            this.logLogIndex = new GlobalLogIndex()
        }
        this.logLogIndex.addEntry(entry, entryNum, entryOffset, length)
    }

    addLogLogEntry(entry: LogEntry, entryNum: number, entryOffset: number, length: number) {
        if (this.logLogIndex === null) {
            this.logLogIndex = new LogLogIndex()
        }
        this.logLogIndex.addEntry(entry, entryNum, entryOffset, length)
    }

    filename() {
        return path.join(this.persist.config.logDir!, this.logId.logDirPrefix(), `${this.logId.base64()}.log`)
    }
}
