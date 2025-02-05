import BinaryLogEntry from "./entry/binary-log-entry"
import CommandLogEntry from "./entry/command-log-entry"
import CreateLogCommand from "./entry/command/create-log-command"
import SetConfigCommand from "./entry/command/set-config-command"
import GlobalLogCheckpoint from "./entry/global-log-checkpoint"
import GlobalLogEntry from "./entry/global-log-entry"
import JSONLogEntry from "./entry/json-log-entry"
import LogLogCheckpoint from "./entry/log-log-checkpoint"
import LogLogEntry from "./entry/log-log-entry"
import ReadEntriesIOOperation from "./persist/io/read-entries-io-operation"
import ReadEntryIOOperation from "./persist/io/read-entry-io-operation"
import ReadRangeIOOperation from "./persist/io/read-range-io-operation"

/**
 * Default file name for hot log
 */
export const DEFAULT_HOT_LOG_FILE_NAME = "global-hot.log"

/**
 * Maximum entry size of 32KB and maximum log size of 16MB are temporary limitations
 */
export const MAX_ENTRY_SIZE = 2 ** 15
export const MAX_LOG_SIZE = 2 ** 24

/**
 * Maximum number of entries to return in response
 */
export const MAX_RESPONSE_ENTRIES = 100

/**
 * Every CommandLogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the command name.
 */
export const enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
}

export type COMMAND_CLASSES = typeof CreateLogCommand | typeof SetConfigCommand

export const COMMAND_CLASS: { [index: number]: COMMAND_CLASSES } = {
    [CommandName.CREATE_LOG]: CreateLogCommand,
    [CommandName.SET_CONFIG]: SetConfigCommand,
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

export enum IOOperationType {
    READ_ENTRY,
    READ_ENTRIES,
    READ_RANGE,
    WRITE,
}

export type ReadIOOperation = ReadEntryIOOperation | ReadEntriesIOOperation | ReadRangeIOOperation

/**
 * Error thrown by log writer if a write was aborted.
 */
export class AbortWriteError extends Error {
    constructor() {
        super("Write Aborted")
    }
}

/**
 * Write a checkpoint entry to the global log at the beginning of every 128KB block
 */
export const GLOBAL_LOG_CHECKPOINT_INTERVAL = 128 * 1024

/**
 * Length of GlobalLogCheckpoint entry which must be fixed
 * - 1 byte entry type
 * - 2 byte lastEntryOffset
 * - 2 byte lastEntryLength
 * - 4 byte cksum
 */
export const GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH = 9

/**
 * Write a checkpoint entry to the log at the beginning of every 128KB block
 */
export const LOG_LOG_CHECKPOINT_INTERVAL = 128 * 1024

/**
 * Length of LogLogCheckpoint entry which must be fixed
 * - 1 byte entry type
 * - 2 byte lastEntryOffset
 * - 2 byte lastEntryLength
 * - 4 byte lastConfigOffset
 * - 4 byte cksum
 */
export const LOG_LOG_CHECKPOINT_BYTE_LENGTH = 13

/**
 * Global logs have a prefix of 27 bytes
 * - 1 byte entry type
 * - 16 byte logId
 * - 4 byte entryNum
 * - 2 byte length
 * - 4 byte crc
 */
export const GLOBAL_LOG_PREFIX_BYTE_LENGTH = 27

/**
 * Log logs have a prefix of 11 bytes
 * - 1 byte entry type
 * - 4 byte entryNum
 * - 2 byte length
 * - 4 byte crc
 */
export const LOG_LOG_PREFIX_BYTE_LENGTH = 11
