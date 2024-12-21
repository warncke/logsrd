import { ReadIOOperation } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"
import IOQueue from "./io-queue"
import WriteIOOperation from "./write-io-operation"

export default class GlobalLogIOQueue {
    queues: Map<string, IOQueue> = new Map()

    enqueue(item: IOOperation) {
        if (item.logId === null) {
            this.getGlobalQueue()!.enqueue(item)
        } else {
            this.getLogQueue(item.logId).enqueue(item)
        }
    }

    deleteLogQueue(logId: LogId): IOQueue | null {
        if (this.queues.has(logId.base64())) {
            const logQueue = this.queues.get(logId.base64())!
            this.queues.delete(logId.base64())
            return logQueue
        } else {
            return null
        }
    }

    getLogQueue(logId: LogId): IOQueue {
        if (!this.queues.has(logId.base64())) {
            this.queues.set(logId.base64(), new IOQueue())
        }
        return this.queues.get(logId.base64())!
    }

    getGlobalQueue(): IOQueue {
        if (!this.queues.has("global")) {
            this.queues.set("global", new IOQueue())
        }
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
