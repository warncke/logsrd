import fs from "node:fs/promises"
import path from "path"

import JSONCommandType from "./entry/command/command-type/json-command-type"
import CreateLogCommand from "./entry/command/create-log-command"
import GlobalLogEntry from "./entry/global-log-entry"
import LogEntry from "./entry/log-entry"
import LogLogEntry from "./entry/log-log-entry"
import LogConfig from "./log-config"
import LogId from "./log-id"
import GlobalLogIndex from "./log/global-log-index"
import LogIndex from "./log/log-index"
import LogLogIndex from "./log/log-log-index"
import PersistLogStats from "./log/log-stats"
import ReadConfigIOOperation from "./persist/io/read-config-io-operation"
import ReadEntriesIOOperation from "./persist/io/read-entries-io-operation"
import ReadHeadIOOperation from "./persist/io/read-head-io-operation"
import WriteIOOperation from "./persist/io/write-io-operation"
import LogLog from "./persist/log-log"
import PersistedLog from "./persist/persisted-log"
import Server from "./server"

export default class Log {
    server: Server
    logId: LogId
    newHotLogIndex: GlobalLogIndex | null = null
    oldHotLogIndex: GlobalLogIndex | null = null
    logLogIndex: LogLogIndex | null = null
    logLog: LogLog | null = null
    creating: boolean = false
    stats: PersistLogStats = new PersistLogStats()
    config: LogConfig | null = null

    constructor(server: Server, logId: LogId) {
        this.server = server
        this.logId = logId
    }

    async getLog(): Promise<LogLog> {
        if (this.logLog === null) {
            this.logLog = new LogLog({
                server: this.server,
                log: this,
            })
            await this.logLog.init()
        }
        return this.logLog
    }

    async appendOp(target: PersistedLog, entry: LogEntry, entryNum: number | null = null): Promise<WriteIOOperation> {
        let op = new WriteIOOperation(entry, entryNum, this.logId)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    async readEntriesOp(target: PersistedLog, index: LogIndex, entryNums: number[]): Promise<ReadEntriesIOOperation> {
        let op = new ReadEntriesIOOperation(this.logId, index, entryNums)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    async readConfigOp(target: PersistedLog, index: LogIndex): Promise<ReadConfigIOOperation> {
        let op = new ReadConfigIOOperation(this.logId, index)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    async readHeadOp(target: PersistedLog, index: LogIndex): Promise<ReadHeadIOOperation> {
        let op = new ReadHeadIOOperation(this.logId, index)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    moveNewToOldHotLog() {
        this.oldHotLogIndex = this.newHotLogIndex
        this.newHotLogIndex = null
        // get/delete any current ops queued for old hot log which used to be new hot log
        const logQueue = this.server.persist.oldHotLog.ioQueue.deleteLogQueue(this.logId)
        // reassign ops to correct log
        if (logQueue !== null) {
            const [reads, writes] = logQueue.drain()
            for (const op of reads) {
                if (op.processing) {
                    console.error("read op already processing", op)
                }
                // reads stay on old hot log but need the correct index
                ;(op as ReadHeadIOOperation).index = this.oldHotLogIndex!
                this.server.persist.oldHotLog.ioQueue.enqueue(op)
            }
            for (const op of writes) {
                if (op.processing) {
                    console.error("write op already processing", op)
                }
                // writes got to new hot log
                this.server.persist.newHotLog.ioQueue.enqueue(op)
            }
        }
    }

    async emptyOldHotLog(): Promise<void> {
        if (this.oldHotLogIndex === null || !this.oldHotLogIndex.hasEntries()) {
            return
        }
        // make sure LogLog is initialized
        await this.getLog()
        const oldEntries = this.oldHotLogIndex.entries()
        const moveEntries = []
        const logLogMaxEntryNum =
            this.logLogIndex !== null && this.logLogIndex.hasEntries() ? this.logLogIndex.maxEntryNum() : -1

        for (let i = 0; i + 2 < oldEntries.length; i += 3) {
            const entryNum = oldEntries[i]
            // skip entries that are already persisted to log log
            if (entryNum <= logLogMaxEntryNum) {
                continue
            }
            moveEntries.push(entryNum)
        }
        // move any entries
        if (moveEntries.length > 0) {
            // TODO: make this incremental if there are a large number of entries
            const op = await this.readEntriesOp(this.server.persist.oldHotLog, this.oldHotLogIndex, moveEntries)
            if (op.entries === null) {
                throw new Error("entries is null")
            }
            const ops = op.entries.map((entry) => this.appendOp(this.logLog!, entry.entry, entry.entryNum))
            await Promise.all(ops)
            // get/delete any current ops queued for old hot log
            const logQueue = this.server.persist.oldHotLog.ioQueue.deleteLogQueue(this.logId)
            // reassign ops to correct log
            if (logQueue !== null) {
                const [reads, writes] = logQueue.drain()
                for (const op of reads) {
                    if (op.processing) {
                        console.error("read op already processing", op)
                    }
                    // reassign index for op - TODO: fix type hack
                    ;(op as ReadHeadIOOperation).index = this.logLogIndex!
                    this.logLog!.enqueueOp(op)
                }
                for (const op of writes) {
                    if (op.processing) {
                        console.error("write op already processing", op)
                    }
                    op.completeWithError(new Error("write on old hot log"))
                }
            }
        } else {
            // if there were no entries to move there should not be anything queued
            const logQueue = this.server.persist.oldHotLog.ioQueue.deleteLogQueue(this.logId)
            // reassign ops to correct log
            if (logQueue !== null) {
                const [reads, writes] = logQueue.drain()
                for (const op of reads) {
                    if (op.processing) {
                        console.error("read op already processing", op)
                    }
                    op.completeWithError(new Error("read after empty on old hot log"))
                }
                for (const op of writes) {
                    if (op.processing) {
                        console.error("write op already processing", op)
                    }
                    op.completeWithError(new Error("write on old hot log"))
                }
            }
        }
        // wait for any ioInProgress on old hot log to complete
        await this.server.persist.oldHotLog.waitInProgress()
        this.oldHotLogIndex = null
    }

    async append(entry: LogEntry): Promise<GlobalLogEntry | LogLogEntry> {
        const op = await this.appendOp(this.server.persist.newHotLog, entry)
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
            const op = this.appendOp(this.server.persist.newHotLog, entry)
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
        if (!this.hasGlobalConfig() && this.logLog === null) {
            await this.getLog()
        }
        const op = await this.readConfigOp(...this.readConfigTargetIndex())
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

    hasGlobalConfig(): boolean {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
            return true
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            return true
        } else {
            return false
        }
    }

    readConfigTargetIndex(): [PersistedLog, LogIndex] {
        // indexes should not have duplicates but make sure this is correct even if they do
        let logLogConfigEntryNum: number | null = null
        if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            ;[logLogConfigEntryNum] = this.logLogIndex.lastConfig()
        }
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
            const [configEntryNum] = this.newHotLogIndex.lastConfig()
            if (logLogConfigEntryNum !== null && logLogConfigEntryNum >= configEntryNum) {
                return [this.logLog!, this.logLogIndex!]
            } else {
                return [this.server.persist.newHotLog, this.newHotLogIndex]
            }
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            const [configEntryNum] = this.oldHotLogIndex.lastConfig()
            if (logLogConfigEntryNum !== null && logLogConfigEntryNum >= configEntryNum) {
                return [this.logLog!, this.logLogIndex!]
            } else {
                return [this.server.persist.oldHotLog, this.oldHotLogIndex]
            }
        } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            return [this.logLog!, this.logLogIndex]
        } else {
            throw new Error("No config found")
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
        const op = await this.readHeadOp(...this.readHeadTargetIndex())
        if (op.entry === null) {
            throw new Error("entry is null")
        }
        return op.entry
    }

    readHeadTargetIndex(): [PersistedLog, LogIndex] {
        // indexes should not have duplicates but make sure this is correct even if they do
        let logLogHeadEntryNum: number | null = null
        if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            ;[logLogHeadEntryNum] = this.logLogIndex.lastEntry()
        }
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            const [headEntryNum] = this.newHotLogIndex.lastEntry()
            if (logLogHeadEntryNum !== null && logLogHeadEntryNum >= headEntryNum) {
                return [this.logLog!, this.logLogIndex!]
            } else {
                return [this.server.persist.newHotLog, this.newHotLogIndex]
            }
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            const [headEntryNum] = this.oldHotLogIndex.lastEntry()
            if (logLogHeadEntryNum !== null && logLogHeadEntryNum >= headEntryNum) {
                return [this.logLog!, this.logLogIndex!]
            } else {
                return [this.server.persist.oldHotLog, this.oldHotLogIndex]
            }
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return [this.logLog!, this.logLogIndex]
        } else {
            throw new Error("No config found")
        }
    }

    async getEntryNums(entryNums: number[]): Promise<Array<GlobalLogEntry | LogLogEntry>> {
        // entryNums are not necessarily in order so map entry nums to original index
        // so that they can be sorted and read in order which is more efficient
        const entryNumIndexes = entryNums.map((entryNum, index) => [entryNum, index]).sort((a, b) => a[0] - b[0])
        // entryNums may be spread across different logs files
        const logLogEntries = []
        const oldHotLogEntries = []
        const newHotLogEntries = []
        // assign each entry to log it should be read from
        for (let i = 0; i < entryNumIndexes.length; i++) {
            const [entryNum] = entryNumIndexes[i]
            if (this.logLogIndex !== null && this.logLogIndex.hasEntry(entryNum)) {
                logLogEntries.push(entryNum)
            } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntry(entryNum)) {
                oldHotLogEntries.push(entryNum)
            } else if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntry(entryNum)) {
                newHotLogEntries.push(entryNum)
            } else {
                throw new Error(`entryNum ${entryNum} not found`)
            }
        }
        // perform read ops on each log that has entries
        let ops = []
        if (logLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.logLog!, this.logLogIndex!, logLogEntries))
        }
        if (oldHotLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.server.persist.oldHotLog, this.oldHotLogIndex!, oldHotLogEntries))
        }
        if (newHotLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.server.persist.newHotLog, this.newHotLogIndex!, newHotLogEntries))
        }
        // wait for all ops to complete
        const results = await Promise.all(ops)
        // combine all entries into array - because of the order of ops and the write flow
        // between logs they will still be sorted by entryNum
        const entries = results
            .map((result) => {
                if (result.entries === null) {
                    throw new Error("entries is null")
                }
                return result.entries
            })
            .flat()
        // return entries to requested order
        const ret = Array(entryNums.length)
        for (let i = 0; i < entryNumIndexes.length; i++) {
            const [_, index] = entryNumIndexes[i]
            ret[index] = entries[i]
        }
        return ret
    }

    async getEntries(offset: number, limit: number): Promise<Array<GlobalLogEntry | LogLogEntry>> {
        // entryNums may be spread across different logs files
        const logLogEntries = []
        const oldHotLogEntries = []
        const newHotLogEntries = []
        // perform read ops on each log that has entries
        // TODO: optimize this
        for (let i = 0; i < limit; i++) {
            const entryNum = offset + i
            if (this.logLogIndex !== null && this.logLogIndex.hasEntry(entryNum)) {
                logLogEntries.push(entryNum)
            } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntry(entryNum)) {
                oldHotLogEntries.push(entryNum)
            } else if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntry(entryNum)) {
                newHotLogEntries.push(entryNum)
            } else {
                if (i === 0) {
                    throw new Error(`entryNum ${entryNum} not found`)
                } else {
                    break
                }
            }
        }
        // perform read ops on each log that has entries
        let ops = []
        if (logLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.logLog!, this.logLogIndex!, logLogEntries))
        }
        if (oldHotLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.server.persist.oldHotLog, this.oldHotLogIndex!, oldHotLogEntries))
        }
        if (newHotLogEntries.length > 0) {
            ops.push(this.readEntriesOp(this.server.persist.newHotLog, this.newHotLogIndex!, newHotLogEntries))
        }
        // wait for all ops to complete
        const results = await Promise.all(ops)
        // combine all entries into array - because of the order of ops and the write flow
        // between logs they will still be sorted by entryNum
        return results
            .map((result) => {
                if (result.entries === null) {
                    throw new Error("entries is null")
                }
                return result.entries
            })
            .flat()
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

    addLogLogEntry(entry: LogEntry, entryNum: number, entryOffset: number, length: number) {
        if (this.logLogIndex === null) {
            this.logLogIndex = new LogLogIndex()
        }
        this.logLogIndex.addEntry(entry, entryNum, entryOffset, length)
    }

    newHotLogEntryCount(): number {
        return this.newHotLogIndex === null ? 0 : this.newHotLogIndex.entryCount()
    }

    oldHotLogEntryCount(): number {
        return this.oldHotLogIndex === null ? 0 : this.oldHotLogIndex.entryCount()
    }

    logLogEntryCount(): number {
        return this.logLogIndex === null ? 0 : this.logLogIndex.entryCount()
    }

    filename() {
        if (this.logId.logDirPrefix() !== LogId.newFromBase64(this.logId.base64()).logDirPrefix()) {
            console.error("logId mismatch", this.logId, this.logId.logId.buffer)
        }
        return path.join(this.server.persist.config.logDir!, this.logId.logDirPrefix(), `${this.logId.base64()}.log`)
    }
}
