import { Writable, WriteQueueItem } from "../globals"
import LogId from "../log-id"

export default class WriteQueue {
    promise: Promise<void>
    resolve: Function | null = null
    reject: Function | null = null
    queue: WriteQueueItem[] = []

    constructor() {
        // create a single promise to track the write of the entire queue
        // because fsync is only called after all write operations are performed
        // the write of the entire queue is designed to be an atomic operation
        // and so all writers who are pending on the queue need to wait until all
        // writes are complete
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve
            this.reject = reject
        })
    }

    enqueue(logId: LogId, entry: Writable): WriteQueueItem {
        const item = { logId, entry }
        this.queue.push(item)
        return item
    }
}
