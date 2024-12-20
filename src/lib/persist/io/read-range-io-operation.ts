import { IOOperationType } from "../../globals"
import LogId from "../../log-id"
import IOOperation from "./io-operation"

export default class ReadRangeIOOperation extends IOOperation {
    reads: number[] | null
    buffers: Uint8Array[] = []
    bytesRead = 0

    constructor(reads: number[] | null = null, logId: LogId | null = null) {
        super(IOOperationType.READ_RANGE, logId)
        this.reads = reads
    }
}
