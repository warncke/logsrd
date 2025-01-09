import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import LogIndex from "../../log/log-index"
import IOOperation from "./io-operation"

export default class ReadEntryIOOperation extends IOOperation {
    index: LogIndex
    entryNum: number
    entry: GlobalLogEntry | LogLogEntry | null = null
    bytesRead = 0

    constructor(logId: LogId, index: LogIndex, entryNum: number) {
        super(IOOperationType.READ_ENTRY, logId)
        this.index = index
        this.entryNum = entryNum
    }
}
