import fs, { FileHandle } from 'node:fs/promises'

import LogEntry from './log-entry'
import LogId from './log-id'
import GlobalLogWriter from './global-log-writer'
import WriteQueue from './write-queue'

export default class HotLog {
    // map of logId.base64() to array of offset,length,... values for each entry 
    logs: Map<string, Array<number>> = new Map()
    fh: FileHandle|null = null 
    logFile: string
    length: number = 0
    // while the writing of queued writes is in progress this will be set
    // to the current queue being written
    writeInProgress: WriteQueue|null = null
    // when writeInProgress is complete the old queue will be deleted, writeQueue
    // will be moved to writeInProgress, and a new writeQueue will be created
    writeQueue: WriteQueue|null = null

    constructor({ logFile }: { logFile: string }) {
        this.logFile = logFile
        this.writeQueue = new WriteQueue()
    }

    async append(logId: LogId, entry: LogEntry): Promise<void> {
        if (this.writeQueue === null) {
            this.writeQueue = new WriteQueue()
        }
        const done = this.writeQueue.push({logId, entry})
        const promise = this.writeQueue.promise
        if (!this.writeInProgress) GlobalLogWriter.write(this).catch(err => {
            // TODO: HANDLE ERROR!
            console.error(err)
        })
        await promise
    }

    async init(): Promise<void> {
        // const stat = await fs.stat(this.logFile)
    }
}