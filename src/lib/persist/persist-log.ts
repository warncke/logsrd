import { FileHandle } from "node:fs/promises"

import { PersistLogArgs } from "../globals"
import LogConfig from "../log-config"
import ReadQueue from "./read-queue"
import WriteQueue from "./write-queue"

export default class PersistLog {
    config: LogConfig
    // write file handle
    fh: FileHandle | null = null
    // read file handles
    busyReadFhs: Array<FileHandle> = []
    freeReadFhs: Array<FileHandle> = []
    // file name of log
    logFile: string
    // length of file. for global log files, where the entire file is read and
    // indexed before starting the server, this will initially be set by reading
    // all bytes from the file. for opening a log log file this is initially set
    // with stat and then the file is read backward from the end in most cases
    // to get the most recent entry. this will be updated internally on writes
    // with the bytes written.
    byteLength: number = 0
    // all writes are submitted to writeQueue. when writeQueueInProgress is null
    // writeQueue is moved to writeQueueInProgress and a new writeQueue is created.
    writeInProgress: WriteQueue | null = null
    writeQueue: WriteQueue
    // when writes need to be blocked by an operation, like finalizing compaction
    // of global logs, the operation sets the writeBocked promise here. if
    // writeInProgress is not null the blocking operation must wait for it to
    // complete before starting. after the blocking operation completes it must
    // move the writeQueue to in progress if it has any pending writes.
    writeBlocked: Promise<void> | null = null
    // read queues and blocking work the same way as for writing but they differ
    // in how they are handled (see implementation for details)
    readInProgress: ReadQueue | null = null
    readQueue: ReadQueue
    readBlocked: Promise<void> | null = null

    constructor({ config, logFile }: PersistLogArgs) {
        this.config = config
        this.logFile = logFile
        this.readQueue = new ReadQueue()
        this.writeQueue = new WriteQueue()
    }

    unblockRead(): void {
        this.readBlocked = null
        // TODO: add method to process read queue
    }

    unblockWrite(): void {
        this.writeBlocked = null
        // TODO: add method to process write queue
    }
}
