import BinaryLogEntry from "./entry/binary-log-entry"
import CommandLogEntry from "./entry/command-log-entry"
import CreateLogCommand from "./entry/command/create-log-command"
import JSONLogEntry from "./entry/json-log-entry"
import LogConfig from "./log-config"
import LogEntry from "./log-entry"
import LogEntryFactory from "./log-entry-factory"
import LogId from "./log-id"
import Persist from "./persist"

export type ServerConfig = {
    host: string
}

export default class Server {
    config: ServerConfig
    persist: Persist
    // cache of log config entries
    coldConfig: Map<string, LogConfig> = new Map()
    hotConfig: Map<string, LogConfig> = new Map()

    static MAX_ENTRY_SIZE = 1024 * 32

    constructor({ config, persist }: { config: ServerConfig; persist: Persist }) {
        this.config = config
        this.persist = persist
    }

    async appendLog(logId: LogId, data: Uint8Array): Promise<number | null> {
        const config = await this.getConfig(logId)
        if (config === null) {
            return null
        }

        // TODO: add support for command entries
        let entry
        if (config.type === "json") {
            entry = new JSONLogEntry({ jsonU8: data })
        } else if (config.type === "binary") {
            entry = new BinaryLogEntry(data)
        } else {
            throw new Error(`unknown log type ${config.type}`)
        }

        await this.persist.appendLog(logId, entry)
        // cksum was not performed - unknown error
        if (entry.cksumNum === 0) {
            throw new Error("cksum error")
        }

        return entry.cksumNum
    }

    async createLog(config: any): Promise<LogConfig | null> {
        const logId = await LogId.newRandom()
        config.logId = logId.base64()
        config.master = this.config.host
        if (!config.type) {
            config.type = "json"
        }
        config = new LogConfig(config)
        const entry = new CreateLogCommand({ value: config })
        await this.persist.createLog(logId, entry)
        this.setConfigCache(logId, config)
        return config
    }

    async getConfig(logId: LogId): Promise<LogConfig | null> {
        let config = this.getConfigCache(logId)
        if (config !== null) {
            return config
        }
        const configLogEntry = await this.persist.getConfig(logId)
        if (configLogEntry === null) {
            return null
        }
        config = configLogEntry.value()
        // TODO: sanitize this
        config = new LogConfig(config!)
        this.setConfigCache(logId, config)
        return config
    }

    async getHead(logId: LogId): Promise<JSONLogEntry | BinaryLogEntry | null> {
        const entry = await this.persist.getHead(logId)
        // TODO
        return entry
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        return false
    }

    getConfigCache(logId: LogId): LogConfig | null {
        let configCache = this.hotConfig.get(logId.base64())
        if (configCache !== undefined) {
            return configCache
        }
        configCache = this.coldConfig.get(logId.base64())
        if (configCache !== undefined) {
            this.coldConfig.delete(logId.base64())
            this.hotConfig.set(logId.base64(), configCache)
            return configCache
        }
        return null
    }

    setConfigCache(logId: LogId, config: LogConfig) {
        this.hotConfig.set(logId.base64(), config)
    }
}
