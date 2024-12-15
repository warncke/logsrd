import JSONCommandType from "./entry/command/command-type/json-command-type"
import CreateLogCommand from "./entry/command/create-log-command"
import LogConfig from "./log-config"
import LogEntry from "./log-entry"
import LogId from "./log-id"
import Server from "./server"

export default class Log {
    logId: LogId
    server: Server

    constructor(server: Server, logId: LogId) {
        this.server = server
        this.logId = logId
    }

    async append(entry: LogEntry): Promise<void> {}

    async delete(): Promise<boolean> {
        return false
    }

    async entries() {}

    async head() {}

    async getConfig(): Promise<LogConfig | null> {
        const configLogEntry = await this.server.persist.getConfig(this.logId)
        if (configLogEntry === null) {
            return null
        }
        const config = configLogEntry.value()
        // TODO: sanitize this
        return new LogConfig(config)
    }

    static async create(server: Server, config: any): Promise<LogConfig | null> {
        const logId = await LogId.newRandom()
        config.logId = logId.base64()
        config.master = server.config.host
        if (!config.type) {
            config.type = "json"
        }
        config = new LogConfig(config)
        const createLog = new CreateLogCommand({ value: config })
        if (await server.persist.createLog(logId, createLog)) {
            return config
        } else {
            return null
        }
    }
}
