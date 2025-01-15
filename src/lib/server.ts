import path from "node:path"

import BinaryLogEntry from "./entry/binary-log-entry"
import CreateLogCommand from "./entry/command/create-log-command"
import GlobalLogEntry from "./entry/global-log-entry"
import JSONLogEntry from "./entry/json-log-entry"
import LogLogEntry from "./entry/log-log-entry"
import { DEFAULT_HOT_LOG_FILE_NAME, MAX_RESPONSE_ENTRIES } from "./globals"
import Log from "./log"
import { AccessAllowed } from "./log/access"
import LogConfig from "./log/log-config"
import LogId from "./log/log-id"
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

    async appendLog(
        logId: LogId,
        token: string | null,
        data: Uint8Array,
        lastEntryNum: number | null,
    ): Promise<GlobalLogEntry> {
        const log = this.getLog(logId)
        const config = await log.getConfig()

        if (!(await log.access.allowWrite(token))) {
            throw new Error("Access denied")
        }

        if (lastEntryNum !== null && lastEntryNum !== log.lastEntryNum()) {
            throw new Error("lastEntryNum mismatch")
        }

        let entry
        if (config.type === "json") {
            entry = new JSONLogEntry({ jsonU8: data })
        } else if (config.type === "binary") {
            entry = new BinaryLogEntry(data)
        } else {
            throw new Error(`unknown log type ${config.type}`)
        }

        entry = await log.append(entry)
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
            this.logs.set(entry.logId.base64(), log)
            await log.appendOp(this.persist.newHotLog, entry)
        }
        // TODO: handle set config which may start a new partial log on replica
        else {
            const log = this.getLog(entry.logId)
            const config = await log.getConfig()
            // TODO: validation
            await log.appendOp(this.persist.newHotLog, entry)
        }

        return entry
    }

    async createLog(config: any): Promise<GlobalLogEntry> {
        let logId
        if (config.logId) {
            throw new Error("Setting logId not allowed. Random logId will be provided.")
        } else {
            logId = await LogId.newRandom()
            config.logId = logId.base64()
        }
        if (config.master) {
            if (config.master !== this.config.host) {
                throw new Error(`config.master must be host ${this.config.host}`)
            }
        } else {
            config.master = this.config.host
        }
        config = await LogConfig.newFromJSON(config)
        const entry = await this.getLog(logId).create(config)
        return entry
    }

    async getConfig(
        logId: LogId,
        token: string | null,
    ): Promise<{ allowed: AccessAllowed; entry: GlobalLogEntry | LogLogEntry }> {
        const log = this.getLog(logId)
        const config = await log.getConfig()
        const allowed = await log.access.allowed(token)
        if (!allowed.admin) {
            throw new Error("Access denied")
        }
        const entry = await log.getConfigEntry()
        return { allowed, entry }
    }

    async getEntries(
        logId: LogId,
        token: string | null,
        entryNums: string | number[] | undefined,
        offset: string | number | undefined,
        limit: string | number | undefined,
    ): Promise<{ allowed: AccessAllowed; entries: Array<GlobalLogEntry | LogLogEntry> }> {
        const log = this.getLog(logId)
        const config = await log.getConfig()
        const allowed = await log.access.allowed(token)
        // entries may be either a command which requires admin or an entry which requires read
        // if client has access to one but not the other then entries they do not have access to
        // will be returned as empty objects
        if (!allowed.read && !allowed.admin) {
            throw new Error("Access denied")
        }

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
            return {
                allowed,
                entries: await this.getLog(logId).getEntryNums(entryNums),
            }
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
            return {
                allowed,
                entries: await this.getLog(logId).getEntries(offset, limit),
            }
        }
    }

    async getHead(
        logId: LogId,
        token: string | null,
    ): Promise<{ allowed: AccessAllowed; entry: GlobalLogEntry | LogLogEntry }> {
        const log = this.getLog(logId)
        const config = await log.getConfig()
        const allowed = await log.access.allowed(token)
        // head may be either a command which requires admin or an entry which requires read
        if (!allowed.read && !allowed.admin) {
            throw new Error("Access denied")
        }
        const entry = await log.getHead()
        return { allowed, entry }
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        return false
    }
}
