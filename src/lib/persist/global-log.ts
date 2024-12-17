import GlobalLogEntryFactory from "../global-log-entry-factory"
import LogEntry from "../log-entry"
import LogId from "../log-id"
import GlobalLogReader from "./global-log-reader"
import GlobalLogWriter from "./global-log-writer"
import LogIndex from "./log-index"
import PersistLog from "./persist-log"
import ReadQueue from "./read-queue"
import WriteQueue from "./write-queue"

export default class GlobalLog extends PersistLog {
    maxReadFHs: number = 16
    // map of logId.base64() to LogIndex
    index: Map<string, LogIndex> = new Map()

    async append(logId: LogId, entry: LogEntry): Promise<void> {
        if (this.writeQueue === null) {
            this.writeQueue = new WriteQueue()
        }
        // since we wait on a common promise, errors for individual
        // writes will be set on item if they occur
        const item = this.writeQueue.enqueue(logId, entry)
        // capture promise for current write queue because we do not
        // know when it will be moved to in progress
        const promise = this.writeQueue.promise
        // if there is no write in progress then start writing now
        if (!this.writeBlocked && !this.writeInProgress) {
            GlobalLogWriter.processWriteQueue(this).catch((err) => {
                // errors should be handled internally but add this for completeness
                console.error(err)
            })
        }
        // wait for write queue to complete
        await promise
        // if item had an error then throw it
        if (item.error) {
            throw item.error
        }
    }

    async getEntry(logId: LogId, offset: number, length: number): Promise<LogEntry> {
        if (this.readQueue === null) {
            this.readQueue = new ReadQueue()
        }
        const item = this.readQueue.enqueue(logId, [offset, length])
        // if there is no read in progress then start reading now
        if (!this.readBlocked && !this.readInProgress) {
            GlobalLogReader.processReadQueue(this)
        }
        const [entryU8] = await item.promise
        const globalLogEntry = GlobalLogEntryFactory.fromU8(entryU8)
        if (globalLogEntry.logId.base64() !== logId.base64()) {
            throw new Error("logId mismatch")
        }
        if (!globalLogEntry.verify()) {
            throw new Error("cksum verify failed")
        }
        return globalLogEntry.entry
    }

    async init(): Promise<void> {
        return GlobalLogReader.initGlobal(this)
    }
}
