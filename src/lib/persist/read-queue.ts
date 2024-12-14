import { ReadQueueItem } from "../globals"

export default class ReadQueue {
    queue: ReadQueueItem[] = []

    constructor() {}

    push(item: ReadQueueItem): void {
        item.promise = new Promise((resolve, reject) => {
            item.resolve = resolve
            item.reject = reject
        })
        this.queue.push(item)
    }
}
