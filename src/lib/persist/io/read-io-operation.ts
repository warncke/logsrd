import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class ReadIOOperation extends IOOperation {
    reads: number[] | null
    bytesRead = 0

    constructor(reads: number[] | null = null, logId: LogId | null = null) {
        super(IOOperationType.READ, logId)
        this.reads = reads
    }
}
