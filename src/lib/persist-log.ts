import CommandCreateLog from "./entry/command/create-log-command";
import LogConfig from "./log-config";
import LogId from "./log-id";
import Persist from "./persist";

export default class PersistLog {
    config: LogConfig|null = null
    logId: LogId
    persist: Persist

    constructor({
        config,
        logId,
        persist,
    } : {
        config?: LogConfig|null,
        logId: LogId,
        persist: Persist
    }) {
        this.config = config ? config : null
        this.logId = logId
        this.persist = persist
    }

    async delete(): Promise<boolean> {
        return false
    }

    static async create({ config, logId, persist }: { config: LogConfig, logId: LogId, persist: Persist }) {
        await persist.hotLog.append(logId, new CommandCreateLog({value: config}))
        return new PersistLog({ config, logId, persist })
    }

    static async init({ logId, persist }: { logId: LogId, persist: Persist }): Promise<PersistLog|null> {
        return null
    }
}
