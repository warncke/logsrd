import { IOOperationType } from "../../globals"
import LogEntry from "../../log-entry"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class WriteIOOperation extends IOOperation {
    entry: LogEntry
    bytesWritten = 0

    constructor(entry: LogEntry, logId: LogId | null = null) {
        super(IOOperationType.WRITE, logId)
        this.entry = entry
    }
}
