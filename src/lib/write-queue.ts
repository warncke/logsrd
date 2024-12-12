import LogEntry from "./log-entry";
import LogId from "./log-id";

export default class WriteQueue {
    promise: Promise<void>
    resolve: Function|null = null
    reject: Function|null = null
    queue: (LogId|LogEntry)[] = [];

    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        })
    }

    push(logId: LogId, entry: LogEntry): Promise<void> {
        this.queue.push(logId, entry);
        // return promise that will be resolved when all entries are written
        return this.promise
    }
}