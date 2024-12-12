import 'core-js/actual/typed-array/to-base64'

import Log from './log';
import LogConfig from './log-config';
import LogId from './log-id';
import Persist from './persist';

export type ServerConfig = {
    host: string
}

export default class Server {
    config: ServerConfig
    persist: Persist

    constructor({ config, persist }: { config: ServerConfig, persist: Persist }) {
        this.config = config
        this.persist = persist;
    }

    async createLog({ config }: { config: any }): Promise<LogConfig|null> {
        const log = await Log.create({ config, server: this })
        if (log === null) {
            return null
        }
        else {
            return log.persist.config
        }
    }

    async deleteLog(logId: LogId): Promise<boolean> {
        const log = await this.getLog(logId)
        if (log === null) {
            return false
        }
        if (await log.delete()) {
            return true
        }
        else {
            return false
        }
    }

    async getLog(logId: LogId): Promise<Log | null> {
        const pLog = await this.persist.openLog({ logId });
        if (pLog === null) {
            return null;
        }
        return new Log({ persist: pLog });
    }
}
