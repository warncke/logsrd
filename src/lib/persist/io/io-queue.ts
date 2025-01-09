import { IOOperationType, ReadIOOperation } from "../../globals"
import IOOperation from "./io-operation"
import WriteIOOperation from "./write-io-operation"

export default class IOQueue {
    readQueue: ReadIOOperation[] = []
    writeQueue: WriteIOOperation[] = []

    constructor() {}

    getReady(): [ReadIOOperation[], WriteIOOperation[]] {
        if (!this.opPending()) {
            return [[], []]
        }
        const readOps = this.readQueue
        const writeOps = this.writeQueue
        this.readQueue = []
        this.writeQueue = []
        for (const op of readOps) {
            op.processing = true
        }
        for (const op of writeOps) {
            op.processing = true
        }
        return [readOps, writeOps]
    }

    drain(): [ReadIOOperation[], WriteIOOperation[]] {
        const readOps = this.readQueue
        const writeOps = this.writeQueue
        this.readQueue = []
        this.writeQueue = []
        return [readOps, writeOps]
    }

    /**
     * consolidate all items ready for processing to oldQueue and return true if there are any
     */
    opPending(): boolean {
        return this.readQueue.length > 0 || this.writeQueue.length > 0
    }

    enqueue(op: IOOperation) {
        if (op.op === IOOperationType.WRITE) {
            this.writeQueue.push(op as WriteIOOperation)
        } else {
            this.readQueue.push(op as ReadIOOperation)
        }
    }
}
