import BinaryLogEntry from "./entry/binary-log-entry"
import CreateLogCommand from "./entry/command/create-log-command"
import SetConfigCommand from "./entry/command/set-config-command"
import GlobalLogEntry from "./entry/global-log-entry"
import JSONLogEntry from "./entry/json-log-entry"
import LogEntry from "./entry/log-entry"
import LogLogEntry from "./entry/log-log-entry"
import LogConfig from "./log-config"
import LogId from "./log-id"
import Persist from "./persist"
import GlobalLog from "./persist/persisted-log/global-log"

export type ServerConfig = {
    host: string
}

export default class Server {
    config: ServerConfig
    persist: Persist

    constructor({ config, persist }: { config: ServerConfig; persist: Persist }) {
        this.config = config
        this.persist = persist
    }

    async appendLog(logId: LogId, data: Uint8Array): Promise<{ entryNum: number; crc: number }> {
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

        entry = await this.persist.getLog(logId).append(entry)
        // cksum was not performed - unknown error
        if (entry.cksumNum === 0) {
            throw new Error("cksum error")
        }

        return {
            crc: entry.cksumNum,
            entryNum: entry.entryNum,
        }
    }

    async createLog(config: any): Promise<LogConfig> {
        const logId = await LogId.newRandom()
        config.logId = logId.base64()
        config.master = this.config.host
        if (!config.type) {
            config.type = "json"
        }
        config = new LogConfig(config)
        await this.persist.getLog(logId).create(config)
        return config
    }

    async getConfig(logId: LogId): Promise<LogConfig> {
        let config = await this.persist.getLog(logId).getConfig()
        return config
    }

    async getHead(logId: LogId): Promise<GlobalLogEntry | LogLogEntry> {
        const entry = await this.persist.getLog(logId).getHead()
        // TODO
        return entry
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        return false
    }
}
