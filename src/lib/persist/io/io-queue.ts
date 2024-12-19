import IOOperation from "./io-operation"
import ReadIOOperation from "./read-io-operation"
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
        const writeOps: WriteIOOperation[] = []
        // and pending items are in oldQueue now
        for (let i = 0; i < this.oldQueue!.length; i++) {
            const item = this.oldQueue![i]
            // TODO: this can be optimized further by tracking dependencies between different
            // types of read/write ops (e.g. reads for config could proceed before writes as
            // long as the write is not a config) but this is more complex so doing it simple
            // for now

            // item is read
            if (item instanceof ReadIOOperation) {
                if (writeOps.length > 0) {
                    // do not take read after write
                    break
                } else {
                    item.processing = true
                    readOps.push(item)
                }
            }
            // item is write
            else if (item instanceof WriteIOOperation) {
                if (readOps.length > 0) {
                    // do not take write after read
                    break
                } else {
                    item.processing = true
                    writeOps.push(item)
                }
            } else {
                throw new Error("unknown op type")
            }
        }

        return [readOps, writeOps]
    }

    /**
     * consolidate all items ready for processing to oldQueue and return true if there are any
     */
    opPending(): boolean {
        // removed any processed items from queue or return if there are unprocessed items
        if (this.oldQueue !== null) {
            while (this.oldQueue.length > 0) {
                if (this.oldQueue[0].processing === true && this.oldQueue[0].endTime === 0) {
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
