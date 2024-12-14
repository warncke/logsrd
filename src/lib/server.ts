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

    async createLog({ config }: { config: any }): Promise<LogConfig | null> {
        config = await Log.create({ config, server: this })
        return config === null ? null : config
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        const log = new Log({ logId, persist: this.persist })
        return await log.delete()
    }
}
