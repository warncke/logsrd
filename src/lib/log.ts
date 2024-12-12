import LogConfig from './log-config';
import LogEntry from './log-entry';
import LogId from './log-id';
import Persist from './persist';
import PersistLog from './persist-log';
import Server from './server';

export default class Log {
    deleting: boolean = false
    persist: PersistLog;

    constructor({ persist }: { persist: PersistLog }) {
        this.persist = persist;
    }

    async append(entry: LogEntry): Promise<void> {

    }

    async delete(): Promise<boolean> {
        if (this.deleting) {
            return false
        }
        this.deleting = true
        return this.persist.delete()
    }

    async entries() {
        
    }

    async head() {

    }

    static async create({ config, server }: { config: any, server: Server }): Promise<Log|null> {
        config.logId = await LogId.newRandom()
        config.master = server.config.host
        if (!config.type) {
            config.type = 'json'
        }
        config = new LogConfig(config)
        const pLog = await server.persist.createLog({ config });
        if (pLog === null) {
            return null
        }
        return new Log({ persist: pLog });
    }
}
