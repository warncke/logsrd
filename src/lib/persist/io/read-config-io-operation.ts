import GlobalLogEntry from "../../entry/global-log-entry"
import LogLogEntry from "../../entry/log-log-entry"
import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class ReadConfigIOOperation extends IOOperation {
    entry: GlobalLogEntry | LogLogEntry | null = null
    bytesRead = 0

    constructor(logId: LogId) {
        super(IOOperationType.READ_CONFIG, logId)
    }
}
