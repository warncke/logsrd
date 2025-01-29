import LogHost from "./log-host"

export default class LogAddress {
    logIdBase64: string
    host: LogHost | null
    config: LogHost[] | null

    /**
     * log address is a string, that must include the base64 logId, and may include the current host
     * and replicas for the log, and may also include the current host and replcas for the logs
     * configuration logs
     *
     * Example:
     *
     * 4Pn28fADU1jXYzJu0dtqhg;127.0.0.1:7000,127.0.0.1:7001;127.0.0.1:7002,127.0.0.1:7003
     *
     * sections, which are optional, must be separated by semicolons
     * hosts and replicas, which are optional, must be separated by commas
     * config logs must be listed in order with the first being the config log for the current log
     *
     * the log can only be accessed through its host, so if only the id is provided, the host and
     * config logs must be resolved through an index service or accessed through a proxy
     *
     * TODO: this should probably support binary addresses for hosts with base64 encoding for storing in
     * json config files
     *
     * host addresses are not validated but servers should only connect to hosts that are explicitly
     * allowed, and in most cases these will be set by internal services, so it is not necessary
     *
     */
    constructor(logIdBase64: string, host: LogHost | null = null, config: LogHost[] | null = null) {
        this.logIdBase64 = logIdBase64
        this.host = host
        this.config = config
    }

    setConfig(config: LogHost[]) {
        this.config = config
    }

    setHost(host: LogHost) {
        this.host = host
    }

    toString(): string {
        const sections = [this.logIdBase64]
        if (this.host !== null) {
            sections.push(this.host.toString())
        }
        if (this.config !== null) {
            for (const host of this.config) {
                sections.push(host.toString())
            }
        }
        return sections.join(";")
    }

    static fromString(logAddress: string): LogAddress {
        if (!(logAddress.length >= 22)) {
            throw new Error("Invalid log address")
        }
        const sections = logAddress.split(";")
        const logIdBase64 = sections.shift()!
        let host = null
        let config = null

        if (sections.length >= 1) {
            host = LogHost.fromString(sections.shift()!)
        }

        while (sections.length > 1) {
            if (config === null) {
                config = []
            }
            config.push(LogHost.fromString(sections.shift()!))
        }

        return new LogAddress(logIdBase64, host, config)
    }
}
