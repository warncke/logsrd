import CreateLogCommand from './entry/command/create-log-command';
import LogConfig from './log-config';
import LogEntry from './log-entry';
import LogId from './log-id';
import Persist from './persist';
import Server from './server';

export default class Log {
    logId: LogId
    persist: Persist

    constructor({ logId, persist }: { logId: LogId, persist: Persist }) {
        this.persist = persist
        this.logId = logId
    }

    async append(entry: LogEntry): Promise<void> {

    }

    async delete(): Promise<boolean> {
        return this.persist.deleteLog(this.logId)
    }

    async entries() {
        
    }

    async head() {

    }

    static async create({ config, server }: { config: any, server: Server }): Promise<LogConfig|null> {
        const logId = await LogId.newRandom()
        config.logId = logId.base64()
        config.master = server.config.host
        if (!config.type) {
            config.type = 'json'
        }
        config = new LogConfig(config)
        const createLog = new CreateLogCommand({value: config})
        if (await server.persist.createLog(logId, createLog)) {
            return config
        }
        else {
            return null
        }
    }
}
