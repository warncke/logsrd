import { IOOperationType } from "../../globals"
import LogId from "../../log-id"

// global ordering for IO operations
let GLOBAL_ORDER = 0

export default class IOOperation {
    op: IOOperationType
    logId: LogId | null
    promise: Promise<any>
    resolve: ((op: IOOperation) => void) | null
    reject: ((err?: any) => void) | null
    startTime: number
    endTime: number = 0
    processing: boolean = false
    order: number

    constructor(
        op: IOOperationType,
        logId: LogId | null = null,
        promise?: Promise<any>,
        resolve = null,
        reject = null,
    ) {
        this.op = op
        this.logId = logId
        this.resolve = resolve
        this.reject = reject
        this.promise =
            promise === undefined
                ? new Promise((res, rej) => {
                      this.resolve = res
                      this.reject = rej
                  })
                : promise
        this.startTime = Date.now()
        this.order = GLOBAL_ORDER++
    }

    complete(op: IOOperation, retried: boolean = false) {
        this.endTime = Date.now()
        // this shouldnt happen because scheduling of IO should be after the function in promise is run
        if (this.resolve === null) {
            console.error("IOQueueItem completed with no resolve", this)
            // try once more
            if (!retried) {
                setTimeout(() => {
                    this.complete(op, true)
                }, 0)
            }
        } else {
            this.resolve(op)
        }
    }

    completeWithError(error: any) {
        this.endTime = Date.now()
        // this shouldnt happen because scheduling of IO should be after the function in promise is run
        if (this.reject === null) {
            console.error("IOQueueItem completeWithError with no resolve")
            setTimeout(() => {
                this.completeWithError(error)
            }, 0)
        } else {
            this.reject(error)
        }
    }
}
