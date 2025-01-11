import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import GlobalLogEntry from "../entry/global-log-entry"
import Log from "../log"
import LogConfig from "../log-config"
import WriteIOOperation from "../persist/io/write-io-operation"

type AppendQueueEntry = {
    entry: GlobalLogEntry
    op: WriteIOOperation
    config: LogConfig | null
}

export default class AppendQueue {
    log: Log
    entries: AppendQueueEntry[] = []
    promise: Promise<void>
    resolve: (() => void) | null = null
    reject: ((err: any) => void) | null = null
    lastConfig: GlobalLogEntry | null = null

    constructor(log: Log) {
        this.log = log
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }

    enqueue(entry: GlobalLogEntry, config: LogConfig | null = null) {
        if (config !== null) {
            this.lastConfig = entry
        }
        // TODO: WriteIOOperation should be refactored to support multiple entries
        const op = new WriteIOOperation(entry, this.log.logId)
        this.entries.push({ entry, op, config })
        this.process()
    }

    async process() {
        if (this.entries.length === 0) {
            return
        }
        if (this.log.appendInProgress !== null) {
            return
        }
        if (this.log.stopped) {
            this.completeWithError(new Error("Log stopped"))
        }
        // set this queue to in progress and create new queue for subsequent appends
        this.log.appendInProgress = this
        this.log.appendQueue = new AppendQueue(this.log)
        try {
            // do replication if any replicas
            const replicatePromises = []
            for (const entry of this.entries) {
                let lastConfig: LogConfig | null = null
                let replicas
                if (entry.config !== null) {
                    replicas = entry.config.replicas
                    lastConfig = entry.config
                } else if (lastConfig !== null) {
                    replicas = (lastConfig as LogConfig).replicas
                } else if (this.log.config !== null) {
                    replicas = this.log.config.replicas
                } else {
                    throw new Error("No config")
                }
                for (const host of replicas) {
                    replicatePromises.push(this.log.server.replicate.appendReplica(host, entry.entry))
                }
            }
            if (replicatePromises.length > 0) {
                await Promise.all(replicatePromises)
            }
            // persist
            await Promise.all(
                this.entries.map((entry) => {
                    this.log.server.persist.newHotLog.enqueueOp(entry.op)
                    entry.op.promise.then((op) => this.log.stats.addOp(op))
                    return entry.op.promise
                }),
            )
            // resolve promise - everything calling waitHead or waitConfig will now resolve with correct entry
            this.complete()
            // clear this queue now that it is complete
            this.log.appendInProgress = null
            // schedule to run again
            setTimeout(() => {
                this.log.appendQueue.process()
            }, 0)
        } catch (err) {
            console.error("AppendQueue error", err)
            // stop log if any persistence errors occur - do not clear in progress queue
            this.log.stop().catch((err) => {
                console.error("Error stopping log", err)
            })
            // reject promise causing everything calling waitHead or waitConfig to error
            this.completeWithError(err)
        }
    }

    hasConfig(): boolean {
        return this.lastConfig !== null
    }

    hasEntries(): boolean {
        return this.entries.length > 0
    }

    async waitHead(): Promise<GlobalLogEntry> {
        if (this.entries.length === 0) {
            throw new Error("No entries in queue")
        }
        const entry = this.entries.at(-1)!.entry
        await this.promise
        return entry
    }

    async waitConfig(): Promise<GlobalLogEntry> {
        if (!this.lastConfig) {
            throw new Error("No config in queue")
        }
        const entry = this.lastConfig
        await this.promise
        return entry
    }

    complete(retried = false) {
        if (this.resolve === null) {
            console.error("AppendQueue completed with no resolve", this)
            if (!retried) {
                setTimeout(() => this.complete(true), 0)
            }
        } else {
            this.resolve()
        }
    }

    completeWithError(err: any, retried = false) {
        if (this.reject === null) {
            console.error("AppendQueue completed with no reject", this)
            if (!retried) {
                setTimeout(() => this.completeWithError(err, true), 0)
            }
        } else {
            this.reject(err)
        }
    }
}
