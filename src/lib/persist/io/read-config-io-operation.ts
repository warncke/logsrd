import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import LogIndex from "../../log/log-index"
import IOOperation from "./io-operation"

export default class ReadConfigIOOperation extends IOOperation {
    entry: GlobalLogEntry | LogLogEntry | null = null
    index: LogIndex
    bytesRead = 0

    constructor(logId: LogId, index: LogIndex) {
        super(IOOperationType.READ_CONFIG, logId)
        this.index = index
    }
}
