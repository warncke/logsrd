import GlobalLogEntry from "../entry/global-log-entry"
import Host from "./host"

export default class AppendReplica {
    host: Host
    entry: GlobalLogEntry
    promise: Promise<void>
    resolve: (() => void) | null = null
    reject: ((err: any) => void) | null = null
    sent: boolean = false
    start: number = Date.now()

    constructor(host: Host, entry: GlobalLogEntry) {
        this.host = host
        this.entry = entry
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
        this.start = Date.now()
    }

    timeout() {
        // TODO: Host handling
        this.completeWithError(new Error("Replicate timeout"))
    }

    complete(retried = false) {
        if (this.resolve === null) {
            console.error("AppendReplica completed with no resolve", this)
            if (!retried) {
                setTimeout(() => this.complete(true), 0)
            }
        } else {
            this.resolve()
        }
    }

    completeWithError(err: any, retried = false) {
        if (this.reject === null) {
            console.error("AppendReplica completed with no reject", this)
            if (!retried) {
                setTimeout(() => this.completeWithError(err, true), 0)
            }
        } else {
            this.reject(err)
        }
    }
}
