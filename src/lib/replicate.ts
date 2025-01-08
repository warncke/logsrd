import LogEntry from "./entry/log-entry"
import LogConfig from "./log-config"
import LogId from "./log-id"

export default class Replicate {
    constructor() {}

    async replicate(logId: LogId, config: LogConfig, entry: LogEntry) {
        // if log is not configured with any replicas then nothing to do
        if (!config.replicas || config.replicas.length === 0) {
            return
        }
    }
}
