import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import LogIndex from "../../log/log-index"
import GlobalLog from "../global-log"
import IOOperation from "./io-operation"

export default class ReadEntriesIOOperation extends IOOperation {
    index: LogIndex
    entryNums: number[]
    entries: Array<GlobalLogEntry | LogLogEntry> | null = null
    bytesRead = 0

    constructor(logId: LogId, index: LogIndex, entryNums: number[]) {
        super(IOOperationType.READ_ENTRIES, logId)
        this.index = index
        this.entryNums = entryNums
    }
}
