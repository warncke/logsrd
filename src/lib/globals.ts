import BinaryLogEntry from "./entry/binary-log-entry"
import CommandLogEntry from "./entry/command-log-entry"
import BeginCompactColdCommand from "./entry/command/begin-compact-cold-command"
import CreateLogCommand from "./entry/command/create-log-command"
import FinishCompactColdCommand from "./entry/command/finish-compact-cold-command"
import SetConfigCommand from "./entry/command/set-config-command"
import GlobalLogCheckpoint from "./entry/global-log-checkpoint"
import GlobalLogEntry from "./entry/global-log-entry"
import JSONLogEntry from "./entry/json-log-entry"
import LogLogCheckpoint from "./entry/log-log-checkpoint"
import LogLogEntry from "./entry/log-log-entry"
import LogId from "./log-id"

/**
 * Interface for objects that can be written to a log.
 * Provides methods to get byte length, byte arrays and CRC32 checksum.
 */
export interface Writable {
    cksumNum: number
    byteLength: () => number
    u8s: () => Uint8Array[]
    cksum: () => Uint8Array
}

/**
 * Every CommandLogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the command name.
 */
export const enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_COMPACT_COLD,
    FINISH_COMPACT_COLD,
}

export type COMMAND_CLASSES =
    | typeof CreateLogCommand
    | typeof SetConfigCommand
    | typeof BeginCompactColdCommand
    | typeof FinishCompactColdCommand

export const COMMAND_CLASS: { [index: number]: COMMAND_CLASSES } = {
    [CommandName.CREATE_LOG]: CreateLogCommand,
    [CommandName.SET_CONFIG]: SetConfigCommand,
    [CommandName.BEGIN_COMPACT_COLD]: BeginCompactColdCommand,
    [CommandName.FINISH_COMPACT_COLD]: FinishCompactColdCommand,
}

/**
 * Every LogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the entry type.
 */

export const enum EntryType {
    GLOBAL_LOG,
    LOG_LOG,
    GLOBAL_LOG_CHECKPOINT,
    LOG_LOG_CHECKPOINT,
    COMMAND,
    BINARY,
    JSON,
}

export type ENTRY_TYPE_CLASSES =
    | typeof GlobalLogEntry
    | typeof LogLogEntry
    | typeof GlobalLogCheckpoint
    | typeof LogLogCheckpoint
    | typeof CommandLogEntry
    | typeof BinaryLogEntry
    | typeof JSONLogEntry

export const ENTRY_CLASS: { [index: number]: ENTRY_TYPE_CLASSES } = {
    [EntryType.GLOBAL_LOG]: GlobalLogEntry,
    [EntryType.LOG_LOG]: LogLogEntry,
    [EntryType.GLOBAL_LOG_CHECKPOINT]: GlobalLogCheckpoint,
    [EntryType.LOG_LOG_CHECKPOINT]: LogLogCheckpoint,
    [EntryType.COMMAND]: CommandLogEntry,
    [EntryType.BINARY]: BinaryLogEntry,
    [EntryType.JSON]: JSONLogEntry,
}

/**
 * Every log has a type which is included in the config JSON
 */
export const enum LogType {
    BINARY = "binary",
    JSON = "json",
    GLOBAL = "global",
}

export const LOG_TYPE_MAP: { [index: string]: LogType } = {
    binary: LogType.BINARY,
    json: LogType.JSON,
    global: LogType.GLOBAL,
}

/**
 * A WriteQueueItem is an entry to be written to a log that is submitted
 * to a queue. Once the queue is processed and its promise is resolved
 * error will be populated if the entry could not be written.
 */
export type WriteQueueItem = {
    logId: LogId
    entry: Writable
    error?: any
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
    logId: LogId
    reads: number[]
    promise: Promise<Uint8Array[]>
    resolve: (value: Uint8Array[] | PromiseLike<Uint8Array[]>) => void
    reject: (reason?: any) => void
}

/**
 * Error thrown by log writer if a write was aborted.
 */
export class AbortWriteError extends Error {
    constructor() {
        super("Write Aborted")
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

/**
 * Write a checkpoint entry to the global log at the beginning of every 128KB block
 */
export const GLOBAL_LOG_CHECKPOINT_INTERVAL = 128 * 1024

/**
 * Write a checkpoint entry to the log at the beginning of every 128KB block
 */
export const LOG_LOG_CHECKPOINT_INTERVAL = 128 * 1024 // every entry is prefixed with 1 byte entry type + 16 byte logId + 2 byte length + 4 byte crc

/**
 * Global logs have a prefix of 23 bytes
 * - 1 byte entry type
 * - 16 byte logId
 * - 2 byte length
 * - 4 byte crc
 */
export const GLOBAL_LOG_PREFIX_BYTE_LENGTH = 23

/**
 * Log logs have a prefix of 6 bytes
 * - 2 byte length
 * - 4 byte crc
 */
export const LOG_LOG_PREFIX_BYTE_LENGTH = 6
