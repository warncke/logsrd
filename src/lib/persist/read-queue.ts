import { ReadQueueItem } from "../globals"
import LogId from "../log-id"

export default class ReadQueue {
    queue: ReadQueueItem[] = []

    constructor() {}

    enqueue(logId: LogId, reads: number[]): ReadQueueItem {
        const item: any = { logId, reads }
        item.promise = new Promise((resolve, reject) => {
            item.resolve = resolve
            item.reject = reject
        })
        this.queue.push(item as ReadQueueItem)
        return item as ReadQueueItem
    }
}
