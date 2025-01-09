import LogEntry from "../../entry/log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class WriteIOOperation extends IOOperation {
    entry: LogEntry
    entryNum: number | null = null
    bytesWritten = 0

    constructor(entry: LogEntry, logId: LogId | null = null, entryNum: number | null = null) {
        super(IOOperationType.WRITE, logId)
        this.entry = entry
        this.entryNum = entryNum
    }
}
