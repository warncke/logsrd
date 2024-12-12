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

    async init() {

    }

    async create() {
        this.persist.hotLog.append(this.logId, new CommandCreateLog({value: this.config}))
    }

    async delete(): Promise<boolean> {
        return false
    }
}
