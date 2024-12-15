import Log from "./log"
import LogConfig from "./log-config"
import LogId from "./log-id"
import Persist from "./persist"

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

    async createLog(config: any): Promise<LogConfig | null> {
        config = await Log.create(this, config)
        return config === null ? null : config
    }

    async getConfig(logId: LogId): Promise<LogConfig | null> {
        const log = new Log(this, logId)
        // TODO: authentication
        return log.getConfig()
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        const log = new Log(this, logId)
        return await log.delete()
    }
}
