import LogId from "../../log-id"
import ReadIOOperation from "./read-io-operation"

export default class ReadIOOperationDeferred extends ReadIOOperation {
    deferred: () => number[]

    constructor(deferred: () => number[], logId: LogId | null = null) {
        super(null, logId)
        this.deferred = deferred
    }

    getReads() {
        this.reads = this.deferred()
    }
}
