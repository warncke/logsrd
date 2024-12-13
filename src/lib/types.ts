import LogId from "./log-id"
import { Writable } from "./persist/write-queue"

/**
 * Every CommandLogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the command name.
 */
export const enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_WRITE,
    END_WRITE,
    ABORT_WRITE,
}

/**
 * Every LogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the entry type.
 */

export const enum EntryType {
    COMMAND,
    BINARY,
    JSON,
}

/**
 * Every log has a type which is included in the config JSON
 */
export const enum LogType {
    BINARY="binary",
    JSON="json",
    GLOBAL="global",
}

export const LOG_TYPE_MAP: { [index: string]: LogType } = {
    'binary': LogType.BINARY,
    'json': LogType.JSON,
    'global': LogType.GLOBAL,
}

/**
 * A WriteQueueItem is an entry to be written to a log that is submitted
 * to a queue. Once the queue is processed and its promise is resolved
 * error will be populated if the entry could not be written.
 */
export type WriteQueueItem = {
    logId: LogId,
    entry: Writable,
    error?: any,
}

/**
 * A ReadQueueItem is a list of offset, length positions to be read from
 * a log. The reads array is a list of potentially multiple offsets and
 * lengths. The promise is created when inserting the item into the queue
 * and will be resolved/rejected when the read is complete. The resolve
 * and reject functions are stored on the item so they can be called by
 * the reader to complete the operation.
 */
export type ReadQueueItem = {
    logId: LogId,
    reads: number[],
    promise: Promise<Uint8Array[]>,
    resolve: (value: Uint8Array[] | PromiseLike<Uint8Array[]>) => void,
    reject: (reason?: any) => void,
}

/**
 * Error thrown by log writer if a write was aborted.
 */
export class AbortWriteError extends Error {
    constructor() {
        super('Write Aborted')
    }
}

export interface ILogConfig {
    logId: LogId
    master: string
    replicas: string[]
    type: LogType
}

/**
 * 
 */
export type PersistLogArgs = {
    config: ILogConfig
    logFile: string
}