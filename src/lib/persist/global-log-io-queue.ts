import LogId from "../log-id"
import IOOperation from "./io/io-operation"
import IOQueue from "./io/io-queue"
import ReadIOOperation from "./io/read-io-operation"
import WriteIOOperation from "./io/write-io-operation"

export default class GlobalLogIOQueue {
    queues: Map<string, IOQueue> = new Map()

    constructor() {
        this.queues.set("global", new IOQueue())
    }

    enqueue(item: IOOperation) {
        if (item.logId === null) {
            this.getGlobalQueue()!.enqueue(item)
        } else {
            this.getLogQueue(item.logId).enqueue(item)
        }
    }

    getLogQueue(logId: LogId): IOQueue {
        if (!this.queues.has(logId.base64())) {
            this.queues.set(logId.base64(), new IOQueue())
        }
        return this.queues.get(logId.base64())!
    }

    getGlobalQueue(): IOQueue {
        return this.queues.get("global")!
    }

    getReady(): [ReadIOOperation[], WriteIOOperation[]] {
        const readOps: ReadIOOperation[] = []
        const writeOps: WriteIOOperation[] = []
        for (const queue of this.queues.values()) {
            const [r, w] = queue.getReady()
            readOps.push(...r)
            writeOps.push(...w)
        }
        // sort iops by global order
        readOps.sort((a, b) => a.order - b.order)
        writeOps.sort((a, b) => a.order - b.order)

        return [readOps, writeOps]
    }

    opPending() {
        for (const queue of this.queues.values()) {
            if (queue.opPending()) {
                return true
            }
        }
        return false
    }
}
