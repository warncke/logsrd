import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class ReadEntriesIOOperation extends IOOperation {
    entryNums: number[]
    entries: GlobalLogEntry[] | LogLogEntry[] | null = null
    bytesRead = 0

    constructor(logId: LogId, entryNums: number[]) {
        super(IOOperationType.READ_ENTRIES, logId)
        this.entryNums = entryNums
    }
}
