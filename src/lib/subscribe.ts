import CommandLogEntry from "./entry/command-log-entry"
import GlobalLogEntry from "./entry/global-log-entry"
import JSONLogEntry from "./entry/json-log-entry"
import LogId from "./log/log-id"
import Server from "./server"

export default class Subscribe {
    server: Server
    subscriptions: Map<string, boolean> = new Map()

    constructor(server: Server) {
        this.server = server
    }

    async allowSubscription(logId: LogId, token: string | null = null): Promise<boolean> {
        const log = this.server.getLog(logId)
        await log.getConfig()
        return log.access.allowRead(token)
    }

    addSubscription(logId: string) {
        this.subscriptions.set(logId, true)
    }

    delSubscription(logId: string) {
        this.subscriptions.delete(logId)
    }

    hasSubscription(logId: string): boolean {
        return this.subscriptions.has(logId)
    }

    publish(entry: GlobalLogEntry) {
        const logId = entry.logId.base64()
        if (!this.hasSubscription(logId)) {
            return
        }
        // TODO: publishing config changes
        if (entry.entry instanceof CommandLogEntry) {
            this.server.uws.publish(logId, `{"entryNum":${entry.entryNum},"entry":{}}`, false)
        } else if (entry.entry instanceof JSONLogEntry) {
            this.server.uws.publish(logId, `{"entryNum":${entry.entryNum},"entry":${entry.entry.str()}}`, false)
        } else {
            // TODO: binary log entries
        }
    }
}
