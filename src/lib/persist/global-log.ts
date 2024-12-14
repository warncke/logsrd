import { LogIndex, WriteQueueItem } from "../globals"
import LogEntry from "../log-entry"
import LogId from "../log-id"
import GlobalLogReader from "./global-log-reader"
import GlobalLogWriter from "./global-log-writer"
import PersistLog from "./persist-log"
import WriteQueue from "./write-queue"

export default class GlobalLog extends PersistLog {
    // map of logId.base64() to LogIndex
    index: Map<string, LogIndex> = new Map()

    async append(logId: LogId, entry: LogEntry): Promise<void> {
        if (this.writeQueue === null) {
            this.writeQueue = new WriteQueue()
        }
        // since we wait on a common promise, errors for individual
        // writes will be set on item if they occur
        const item: WriteQueueItem = { logId, entry }
        this.writeQueue.push(item)
        // capture promise for current write queue because we do not
        // know when it will be moved to in progress
        const promise = this.writeQueue.promise
        // if there is no write in progress then start writing now
        if (!this.writeInProgress) {
            GlobalLogWriter.write(this).catch((err) => {
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

    async init(): Promise<void> {
        return GlobalLogReader.initGlobal(this)
    }
}
