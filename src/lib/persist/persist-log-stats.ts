import { IOOperationType } from "../globals"
import IOOperation from "./io/io-operation"
import ReadIOOperation from "./io/read-range-io-operation"
import WriteIOOperation from "./io/write-io-operation"

export default class PersistLogStats {
    ioReads: number = 0
    bytesRead: number = 0
    ioReadTimeAvg: number = 0
    ioReadTimeMax: number = 0
    ioReadLastTime: number = 0
    ioWrites: number = 0
    bytesWritten: number = 0
    ioWriteTimeAvg: number = 0
    ioWriteTimeMax: number = 0
    ioWriteLastTime: number = 0

    constructor() {}

    addOp(op: IOOperation) {
        const opTime = op.endTime - op.startTime
        if (op.op in [IOOperationType.READ_HEAD, IOOperationType.READ_CONFIG, IOOperationType.READ_RANGE]) {
            this.ioReadTimeAvg = (this.ioReadTimeAvg * this.ioReads + opTime) / (this.ioReads + 1)
            this.ioReadTimeMax = Math.max(this.ioReadTimeMax, opTime)
            this.ioReadLastTime = op.endTime
            this.bytesRead += (op as ReadIOOperation).bytesRead
            this.ioReads++
        } else if (op.op === IOOperationType.WRITE) {
            this.ioWriteTimeAvg = (this.ioWriteTimeAvg * this.ioWrites + opTime) / (this.ioWrites + 1)
            this.ioWriteTimeMax = Math.max(this.ioWriteTimeMax, opTime)
            this.ioWriteLastTime = op.endTime
            this.bytesWritten += (op as WriteIOOperation).bytesWritten
            this.ioWrites++
        } else {
            throw new Error("unknown IO op")
        }
    }
}
