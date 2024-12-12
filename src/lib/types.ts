/**
 * Every CommandLogEntry begins with a single byte interpreted as a little endian unsigned integer
 * that indicates the command name.
 */
export const enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_WRITE,
    END_WRITE,
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
}

export const LOG_TYPE_MAP: { [index: string]: LogType } = {
    'binary': LogType.BINARY,
    'json': LogType.JSON,
}