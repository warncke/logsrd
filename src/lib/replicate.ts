import LogEntry from "./entry/log-entry"
import LogConfig from "./log-config"
import LogId from "./log-id"
import Server from "./server"

export type ReplicateConfig = {}

export default class Replicate {
    server: Server
    config: ReplicateConfig

    constructor(server: Server, config: ReplicateConfig) {
        this.server = server
        this.config = config
    }

    async replicate(logId: LogId, config: LogConfig, entry: LogEntry) {
        // if log is not configured with any replicas then nothing to do
        if (!config.replicas || config.replicas.length === 0) {
            return
        }
    }
}
