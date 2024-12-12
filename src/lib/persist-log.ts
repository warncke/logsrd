import CommandLogEntry, { CommandName } from "./entry/command-log-entry";
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
        this.persist.hotLog.append(this.logId, new CommandLogEntry(CommandName.CREATE_LOG, JSON.stringify(this.config)))
    }

    async delete(): Promise<boolean> {
        return false
    }
}
