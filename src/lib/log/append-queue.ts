import GlobalLogEntry from "../entry/global-log-entry"
import Log from "../log"
import WriteIOOperation from "../persist/io/write-io-operation"
import LogConfig from "./log-config"

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
        // set this queue to in progress and create new queue for subsequent appends
        this.log.appendInProgress = this
        this.log.appendQueue = new AppendQueue(this.log)
        // TODO: logic here is wrong because entries are replicated/persisted one-by-one, not as
        // a block (this changed), so needs to be rewritten to return success on those that completed
        // and fail on the ones that did not. open question as to whether or not stopping after failure
        // is correct
        try {
            let config = this.log.config

            for (const entry of this.entries) {
                // entry in queue may set new config which applies to subsequent entries
                if (entry.config !== null) {
                    config = entry.config
                }
                // log config should be set except for first create log entry which should
                // have config attached so throw error if this is null
                if (config === null) {
                    throw new Error("No log config")
                }
                // if config is not being set then need to check if log has been stopped
                else if (this.log.stopped || config.stopped) {
                    this.completeWithError(new Error("Log stopped"))
                    return
                }
                // replicate
                if (config.replicas && config.replicas.length > 0) {
                    await Promise.all(
                        config.replicas.map((host) => this.log.server.replicate.appendReplica(host, entry.entry)),
                    )
                }
                // persist
                this.log.server.persist.newHotLog.enqueueOp(entry.op)
                entry.op = await entry.op.promise
                this.log.stats.addOp(entry.op)
                // publish to subscribers
                this.log.server.subscribe.publish(entry.entry)
            }
            // resolve promise - everything calling waitHead or waitConfig will now resolve with correct entry
            this.complete()
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
        } finally {
            this.log.appendInProgress = null
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
