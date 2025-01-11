import GlobalLogEntry from "./entry/global-log-entry"
import Host from "./replicate/host"
import Server from "./server"

export default class Replicate {
    server: Server
    hosts: Map<string, Host> = new Map()

    constructor(server: Server) {
        this.server = server

        for (const host of this.server.config.hosts) {
            if (host === this.server.config.host) {
                continue
            }
            this.hosts.set(host, new Host(this, host))
        }
    }

    async appendReplica(host: string, entry: GlobalLogEntry) {
        if (!this.hosts.has(host)) {
            throw new Error(`unknown host ${host}`)
        }
        await this.hosts.get(host)!.appendReplica(entry)
    }
}
