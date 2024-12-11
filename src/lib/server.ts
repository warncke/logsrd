import Log from './log';
import LogConfig from './log-config';
import LogId from './log-id';
import Persist from './persist';

export type ServerConfig = {
    host: string
}

export default class Server {
    config: ServerConfig
    openLogs: Map<string, Log>
    persist: Persist

    constructor({ config, persist }: { config: ServerConfig, persist: Persist }) {
        this.config = config
        this.openLogs = new Map();
        this.persist = persist;
    }

    async createLog({ config }: { config: LogConfig }): Promise<Log> {
        const pLog = await this.persist.createLog({ config });
        return new Log({ persist: pLog });
    }

    async deleteLog(logId: LogId): Promise<void> {
        await this.closeLog(logId);
    }

    async getLog(logId: LogId): Promise<Log | null> {
        if (this.openLogs.has(logId.base64())) {
            return this.openLogs.get(logId.base64()) || null;
        }

        return this.openLog(logId);
    }

    async openLog(logId: LogId): Promise<Log | null> {
        const pLog = await this.persist.openLog(logId);
        if (pLog === null) {
            return null;
        }
        const newLog = new Log({ persist: pLog });
        this.openLogs.set(logId.base64(), newLog);
        return newLog;
    }

    async closeLog(logId: LogId): Promise<void> {
        this.openLogs.delete(logId.base64());
        await this.persist.deleteLog(logId);
    }
}
