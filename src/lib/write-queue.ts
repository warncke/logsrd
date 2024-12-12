import { FileHandle } from "node:fs/promises";
import LogEntry from "./log-entry";
import LogId from "./log-id";

export interface Writable {
    byteLength: () => number,
    u8s: () => Uint8Array[],
}

export type WriteQueueItem = {
    logId: LogId,
    entry: Writable,
}

export default class WriteQueue {
    promise: Promise<void>
    resolve: Function|null = null
    reject: Function|null = null
    queue: WriteQueueItem[] = [];

    constructor() {
        // create a single promise to track the write of the entire queue
        // because fsync is only called after all write operations are performed
        // the write of the entire queue is designed to be an atomic operation
        // and so all writers who are pending on the queue need to wait until all
        // writes are complete
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        })
    }

    push(item: WriteQueueItem): void {
        this.queue.push(item)
    }
}