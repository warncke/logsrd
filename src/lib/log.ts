import fs from "node:fs/promises"
import path from "path"

import CommandLogEntry from "./entry/command-log-entry"
import JSONCommandType from "./entry/command/command-type/json-command-type"
import CreateLogCommand from "./entry/command/create-log-command"
import SetConfigCommand from "./entry/command/set-config-command"
import GlobalLogEntry from "./entry/global-log-entry"
import LogEntry from "./entry/log-entry"
import LogLogEntry from "./entry/log-log-entry"
import Access from "./log/access"
import AppendQueue from "./log/append-queue"
import GlobalLogIndex from "./log/global-log-index"
import LogConfig from "./log/log-config"
import LogId from "./log/log-id"
import LogIndex from "./log/log-index"
import LogLogIndex from "./log/log-log-index"
import LogStats from "./log/log-stats"
import ReadEntriesIOOperation from "./persist/io/read-entries-io-operation"
import ReadEntryIOOperation from "./persist/io/read-entry-io-operation"
import WriteIOOperation from "./persist/io/write-io-operation"
import LogLog from "./persist/log-log"
import PersistedLog from "./persist/persisted-log"
import Server from "./server"

export default class Log {
    server: Server
    logId: LogId
    access: Access
    newHotLogIndex: GlobalLogIndex | null = null
    oldHotLogIndex: GlobalLogIndex | null = null
    logLogIndex: LogLogIndex | null = null
    logLog: LogLog | null = null
    creating: boolean = false
    stats: LogStats = new LogStats()
    config: LogConfig | null = null
    appendInProgress: AppendQueue | null = null
    appendQueue: AppendQueue
    stopped: boolean = false

    constructor(server: Server, logId: LogId) {
        this.server = server
        this.logId = logId
        this.access = new Access(this)
        this.appendQueue = new AppendQueue(this)
    }

    async getLogLog(): Promise<LogLog> {
        if (this.logLog === null) {
            this.logLog = new LogLog(this.server, this)
            await this.logLog.init()
        }
        return this.logLog
    }

    async stop() {
        // TODO: validate logic
        this.stopped = true
    }

    /**
     * Append using AppendQueue which handles replication and correctly align read head
     * and read config operations with pending writes. Appends always go to HotLog.
     */
    async append(entry: LogEntry, config: LogConfig | null = null): Promise<GlobalLogEntry> {
        entry = new GlobalLogEntry({
            entry,
            entryNum: this.lastEntryNum() + 1,
            logId: this.logId,
        })
        const appendQueue = this.appendQueue
        appendQueue.enqueue(entry as GlobalLogEntry, config)
        await appendQueue.promise
        return entry as GlobalLogEntry
    }

    /**
     * Do immediate append for flushing HotLog to LogLog and writing SetConfig for stop
     */
    async appendOp(target: PersistedLog, entry: GlobalLogEntry | LogLogEntry): Promise<WriteIOOperation> {
        let op = new WriteIOOperation(entry, this.logId)
        target.enqueueOp(op)
        op = await op.promise
        this.stats.addOp(op)
        return op
    }

    async readEntryOp(target: PersistedLog, index: LogIndex, entryNum: number): Promise<ReadEntryIOOperation> {
        let op = new ReadEntryIOOperation(this.logId, index, entryNum)
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
                ;(op as ReadEntriesIOOperation).index = this.oldHotLogIndex!
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
        await this.getLogLog()
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
            const ops = op.entries.map((entry) =>
                this.appendOp(this.logLog!, new LogLogEntry({ entry: entry.entry, entryNum: entry.entryNum })),
            )
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
                    ;(op as ReadEntriesIOOperation).index = this.logLogIndex!
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

    async create(config: LogConfig): Promise<GlobalLogEntry> {
        if (this.creating) {
            throw new Error("already creating")
        }
        if (await this.exists()) {
            throw new Error("already exists")
        }
        this.creating = true
        try {
            const entry = await this.append(new CreateLogCommand({ value: config }), config)
            this.config = config
            return entry
        } catch (err) {
            throw err
        } finally {
            this.creating = false
        }
    }

    async exists(): Promise<boolean> {
        if (this.logLogIndex !== null || this.newHotLogIndex !== null || this.oldHotLogIndex !== null) {
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
            await this.getLogLog()
        }
        // because config is cached it will always be loaded before any appends occur so
        // no need to worry about pending appends here
        const op = await this.readEntryOp(...this.readConfigTargetIndexEntryNum())
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

    async setConfig(setConfig: any, lastConfigNum: number, unsafe: boolean = false): Promise<GlobalLogEntry> {
        // only allow one setConfig at a time
        if (
            (this.appendInProgress !== null && this.appendInProgress.hasConfig()) ||
            (this.appendQueue !== null && this.appendQueue.hasConfig())
        ) {
            throw new Error("setConfig in progress")
        }

        const configEntry = await this.getConfigEntry()
        if (!unsafe && configEntry.entryNum !== lastConfigNum) {
            throw new Error("lastConfigNum mismatch")
        }

        const newConfig = Object.assign((configEntry.entry as JSONCommandType).value(), setConfig)
        const config = await LogConfig.newFromJSON(newConfig)
        const entry = await this.append(new SetConfigCommand({ value: config }), config)
        this.config = config
        return entry
    }

    async getConfigEntry(): Promise<GlobalLogEntry | LogLogEntry> {
        if (this.appendInProgress !== null && this.appendInProgress.hasConfig()) {
            return this.appendInProgress.waitConfig()
        } else if (this.appendQueue.hasConfig()) {
            return this.appendQueue.waitConfig()
        } else {
            const op = await this.readEntryOp(...this.readConfigTargetIndexEntryNum())
            if (op.entry === null) {
                throw new Error("entry is null")
            }
            return op.entry
        }
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

    readConfigTargetIndexEntryNum(): [PersistedLog, LogIndex, number] {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasConfig()) {
            return [this.server.persist.newHotLog, this.newHotLogIndex, this.newHotLogIndex.lastConfigEntryNum()]
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasConfig()) {
            return [this.server.persist.oldHotLog, this.oldHotLogIndex, this.oldHotLogIndex.lastConfigEntryNum()]
        } else if (this.logLogIndex !== null && this.logLogIndex.hasConfig()) {
            return [this.logLog!, this.logLogIndex, this.logLogIndex.lastConfigEntryNum()]
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
        if (this.appendInProgress !== null && this.appendInProgress.hasEntries()) {
            return await this.appendInProgress.waitHead()
        } else if (this.appendQueue.hasEntries()) {
            return await this.appendQueue.waitHead()
        } else {
            const op = await this.readEntryOp(...this.readHeadTargetIndexEntryNum())
            if (op.entry === null) {
                throw new Error("entry is null")
            }
            return op.entry
        }
    }

    readHeadTargetIndexEntryNum(): [PersistedLog, LogIndex, number] {
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            return [this.server.persist.newHotLog, this.newHotLogIndex, this.newHotLogIndex.maxEntryNum()]
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            return [this.server.persist.oldHotLog, this.oldHotLogIndex, this.oldHotLogIndex.maxEntryNum()]
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            return [this.logLog!, this.logLogIndex, this.logLogIndex.maxEntryNum()]
        } else {
            throw new Error("No entries found")
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

    lastEntryNum(): number {
        let maxEntryNum = -1
        if (this.newHotLogIndex !== null && this.newHotLogIndex.hasEntries()) {
            maxEntryNum = this.newHotLogIndex.maxEntryNum()
        } else if (this.oldHotLogIndex !== null && this.oldHotLogIndex.hasEntries()) {
            maxEntryNum = this.oldHotLogIndex.maxEntryNum()
        } else if (this.logLogIndex !== null && this.logLogIndex.hasEntries()) {
            maxEntryNum = this.logLogIndex.maxEntryNum()
        }
        if (this.appendInProgress !== null) {
            maxEntryNum += this.appendInProgress.entries.length
        }
        if (this.appendQueue !== null) {
            maxEntryNum += this.appendQueue.entries.length
        }
        return maxEntryNum
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
            const err = new Error("logId mismatch")
            console.error(
                err,
                this.logId,
                this.logId.logId.buffer,
                LogId.newFromBase64(this.logId.base64()).logId.buffer,
                this.logId.logDirPrefix(),
                LogId.newFromBase64(this.logId.base64()).logDirPrefix(),
                this.logId.base64(),
                LogId.newFromBase64(this.logId.base64()).base64(),
            )
        }
        return path.join(this.server.config.logDir!, this.logId.logDirPrefix(), `${this.logId.base64()}.log`)
    }
}
