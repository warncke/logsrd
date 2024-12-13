import { ReadQueueItem } from "../types";

export interface Writable {
    byteLength: () => number,
    u8s: () => Uint8Array[],
}
export default class ReadQueue {
    queue: ReadQueueItem[] = [];

    constructor() {
    }

    push(item: ReadQueueItem): void {
        item.promise = new Promise((resolve, reject) => {
            item.resolve = resolve;
            item.reject = reject;
        })
        this.queue.push(item)
    }
}