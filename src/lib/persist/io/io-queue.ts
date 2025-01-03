import { IOOperationType, ReadIOOperation } from "../../globals"
import IOOperation from "./io-operation"
import ReadHeadIOOperation from "./read-head-io-operation"
import WriteIOOperation from "./write-io-operation"

export default class IOQueue {
    oldQueue: IOOperation[] | null = null
    newQueue: IOOperation[] = []

    /**
     * v8 is optimized to shift as fast as pop as long as you dont modify the array but if you
     * mix shift and push it completely falls appart. the approach here is to swap old/new arrays
     * and push to new while shifting from old and then create new arrays when old is empty. this
     * also allows space from queues that surge to be garbage collected so it is not all bad.
     */
    constructor() {}

    /**
     * All operations from previous call to getReady must be complete before calling again
     * getReady checks for data dependencies between operations in the currently queued items
     * and returns as many of them as can be processed in a single batch. this assumes that
     * reads and writes will be performed concurrently by the processor so each batch will
     * be only reads or writes or reads that are verified not to have data dependencies on
     * writes (such as reading a range from an immutable part of a log).
     */
    getReady(): [ReadIOOperation[], WriteIOOperation[]] {
        if (!this.opPending()) {
            return [[], []]
        }
        const readOps: ReadIOOperation[] = []
        const readHeadOps: ReadHeadIOOperation[] = []
        const writeOps: WriteIOOperation[] = []
        // pending items are in oldQueue now
        for (let i = 0; i < this.oldQueue!.length; i++) {
            const op = this.oldQueue![i]
            // TODO: this can be optimized further by tracking dependencies between different
            // types of read/write ops (e.g. reads for config could proceed before writes as
            // long as the write is not a config) but this is more complex so doing it simple
            // for now

            // item is read
            if (op.op === IOOperationType.READ_HEAD) {
                if (writeOps.length > 0) {
                    // do not take read after write
                    break
                } else {
                    op.processing = true
                    readHeadOps.push(op as ReadHeadIOOperation)
                }
            } else if (
                op.op in [IOOperationType.READ_RANGE, IOOperationType.READ_ENTRIES, IOOperationType.READ_CONFIG]
            ) {
                if (writeOps.length > 0) {
                    // do not take read after write
                    break
                } else {
                    op.processing = true
                    readOps.push(op as ReadIOOperation)
                }
            }
            // item is write
            else if (op.op === IOOperationType.WRITE) {
                if (readOps.length > 0) {
                    // do not take write after read
                    break
                } else {
                    op.processing = true
                    writeOps.push(op as WriteIOOperation)
                }
            } else {
                throw new Error("unknown op type")
            }
        }

        if (readHeadOps.length > 1) {
            return [readOps.concat(this.combineReadHeadOps(readHeadOps)), writeOps]
        } else if (readHeadOps.length === 1) {
            return [readOps.concat(readHeadOps), writeOps]
        } else {
            return [readOps, writeOps]
        }
    }

    combineReadHeadOps(ops: ReadHeadIOOperation[]): ReadHeadIOOperation {
        const op = new ReadHeadIOOperation(ops[0].logId!, ops[0].index)
        op.reject = (err) => {
            for (const op of ops) {
                op.completeWithError(err)
            }
        }
        op.resolve = (newOp) => {
            for (const op of ops) {
                op.complete(newOp)
            }
        }
        return op
    }

    /**
     * consolidate all items ready for processing to oldQueue and return true if there are any
     */
    opPending(): boolean {
        // removed any processed items from queue or return if there are unprocessed items
        if (this.oldQueue !== null) {
            while (this.oldQueue.length > 0) {
                if (this.oldQueue[0].processing === false) {
                    return true
                } else if (this.oldQueue[0].processing === true && this.oldQueue[0].endTime === 0) {
                    return false
                } else {
                    this.oldQueue.shift()
                }
            }
            // if old queue is empty then clear it
            if (this.oldQueue.length === 0) {
                this.oldQueue = null
            }
        }
        // if old queue is null then swap queues if new is not empty
        if (this.oldQueue === null) {
            if (this.newQueue.length > 0) {
                this.oldQueue = this.newQueue
                this.newQueue = []
                return true
            } else {
                return false
            }
        }
        // if old queue still has items then process them
        if (this.oldQueue.length > 0) {
            if (this.newQueue.length > 0) {
                this.oldQueue = this.oldQueue.concat(this.newQueue)
                this.newQueue = []
            }
            return true
        } else {
            if (this.newQueue.length > 0) {
                this.oldQueue = this.newQueue
                this.newQueue = []
                return true
            } else {
                return false
            }
        }
    }

    enqueue(item: IOOperation) {
        this.newQueue.push(item)
    }
}
