import path from "node:path"

import BinaryLogEntry from "./entry/binary-log-entry"
import CreateLogCommand from "./entry/command/create-log-command"
import GlobalLogEntry from "./entry/global-log-entry"
import GlobalLogEntryFactory from "./entry/global-log-entry-factory"
import JSONLogEntry from "./entry/json-log-entry"
import LogLogEntry from "./entry/log-log-entry"
import { DEFAULT_HOT_LOG_FILE_NAME, MAX_RESPONSE_ENTRIES } from "./globals"
import Log from "./log"
import LogConfig from "./log-config"
import LogId from "./log-id"
import Persist from "./persist"
import Replicate from "./replicate"

export type ServerConfig = {
    host: string
    dataDir: string
    pageSize: number
    globalIndexCountLimit: number
    globalIndexSizeLimit: number
    hotLogFileName?: string
    blobDir?: string
    logDir?: string
    hosts: string[]
    hostMonitorInterval: number
    replicatePath: string
    replicateTimeout: number
    secret: string
}

export default class Server {
    config: ServerConfig
    persist: Persist
    replicate: Replicate
    logs: Map<string, Log> = new Map()

    constructor(config: ServerConfig) {
        config.hotLogFileName = config.hotLogFileName || DEFAULT_HOT_LOG_FILE_NAME
        config.blobDir = config.blobDir || path.join(config.dataDir, "blobs")
        config.logDir = config.logDir || path.join(config.dataDir, "logs")
        this.config = config
        this.persist = new Persist(this)
        this.replicate = new Replicate(this)
    }

    delLog(logId: LogId) {
        this.logs.delete(logId.base64())
    }

    getLog(logId: LogId): Log {
        if (!this.logs.has(logId.base64())) {
            this.logs.set(logId.base64(), new Log(this, logId))
        }
        return this.logs.get(logId.base64())!
    }

    async init() {
        await this.persist.init()
    }

    async appendLog(logId: LogId, data: Uint8Array): Promise<GlobalLogEntry | LogLogEntry> {
        const config = await this.getConfig(logId)
        // TODO: add support for command entries
        let entry
        if (config.type === "json") {
            entry = new JSONLogEntry({ jsonU8: data })
        } else if (config.type === "binary") {
            entry = new BinaryLogEntry(data)
        } else {
            throw new Error(`unknown log type ${config.type}`)
        }

        entry = await this.getLog(logId).append(entry)
        // cksum was not performed - unknown error
        if (entry.cksumNum === 0) {
            throw new Error("cksum error")
        }

        return entry
    }

    async appendReplica(entry: GlobalLogEntry): Promise<GlobalLogEntry> {
        if (entry.entry instanceof CreateLogCommand) {
            if (this.logs.has(entry.logId.base64())) {
                throw new Error(`Log already exists: ${entry.logId.base64()}`)
            }
            const log = new Log(this, entry.logId)
            log.config = new LogConfig(entry.entry.value())
            await log.appendOp(this.persist.newHotLog, entry)
            this.logs.set(entry.logId.base64(), log)
        }
        // TODO: handle set config which may start a new partial log on replica
        else {
            const config = await this.getConfig(entry.logId)
            // TODO: validation
            const log = this.getLog(entry.logId)
            await log.appendOp(this.persist.newHotLog, entry)
        }

        return entry
    }

    async createLog(config: any): Promise<LogConfig> {
        const logId = await LogId.newRandom()
        config.logId = logId.base64()
        config.master = this.config.host
        if (!config.type) {
            config.type = "json"
        }
        config = new LogConfig(config)
        await this.getLog(logId).create(config)
        return config
    }

    async getConfig(logId: LogId): Promise<LogConfig> {
        let config = await this.getLog(logId).getConfig()
        return config
    }

    async getEntries(
        logId: LogId,
        entryNums: string | number[] | undefined,
        offset: string | number | undefined,
        limit: string | number | undefined,
    ): Promise<Array<GlobalLogEntry | LogLogEntry>> {
        if (typeof entryNums === "string" && entryNums.length > 0) {
            entryNums = entryNums
                .split(",")
                .map((n) => parseInt(n))
                .filter((entryNum) => entryNum >= 0)
            if (entryNums!.length === 0) {
                throw new Error("invalid entryNum")
            }
            if (entryNums!.length > MAX_RESPONSE_ENTRIES) {
                throw new Error(`Maximum number of entries is ${MAX_RESPONSE_ENTRIES}`)
            }
            return this.getLog(logId).getEntryNums(entryNums)
        } else {
            if (typeof offset === "string" && offset.length > 0) {
                offset = parseInt(offset)
                if (!(offset >= 0)) {
                    throw new Error("invalid offset")
                }
            } else {
                offset = 0
            }
            if (typeof limit === "string" && limit.length > 0) {
                limit = parseInt(limit)
                if (!(limit >= 0)) {
                    throw new Error("invalid limit")
                }
                if (limit > MAX_RESPONSE_ENTRIES) {
                    throw new Error(`Maximum number of entries is ${MAX_RESPONSE_ENTRIES}`)
                }
            } else {
                limit = MAX_RESPONSE_ENTRIES
            }
            const config = await this.getLog(logId).getConfig()
            return this.getLog(logId).getEntries(offset, limit)
        }
    }

    async getHead(logId: LogId): Promise<GlobalLogEntry | LogLogEntry> {
        const config = await this.getLog(logId).getConfig()
        const entry = await this.getLog(logId).getHead()

        // TODO
        return entry
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        return false
    }
}
