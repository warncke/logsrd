import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log/log-id"
import IOOperation from "./io-operation"

export default class WriteIOOperation extends IOOperation {
    entry: GlobalLogEntry | LogLogEntry
    entryNum: number | null = null
    bytesWritten = 0

    constructor(entry: GlobalLogEntry | LogLogEntry, logId: LogId | null = null, entryNum: number | null = null) {
        super(IOOperationType.WRITE, logId)
        this.entry = entry
        this.entryNum = entryNum
    }
}
