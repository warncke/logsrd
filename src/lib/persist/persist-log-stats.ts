import { IOOperationType } from "../globals"
import IOOperation from "./io/io-operation"
import ReadIOOperation from "./io/read-io-operation"
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

    addIOp(iOp: IOOperation) {
        const opTime = iOp.endTime - iOp.startTime
        if (iOp.op === IOOperationType.READ) {
            this.ioReadTimeAvg = (this.ioReadTimeAvg * this.ioReads + opTime) / (this.ioReads + 1)
            this.ioReadTimeMax = Math.max(this.ioReadTimeMax, opTime)
            this.ioReadLastTime = iOp.endTime
            this.bytesRead += (iOp as ReadIOOperation).bytesRead
            this.ioReads++
        } else if (iOp.op === IOOperationType.WRITE) {
            this.ioWriteTimeAvg = (this.ioWriteTimeAvg * this.ioWrites + opTime) / (this.ioWrites + 1)
            this.ioWriteTimeMax = Math.max(this.ioWriteTimeMax, opTime)
            this.ioWriteLastTime = iOp.endTime
            this.bytesWritten += (iOp as WriteIOOperation).bytesWritten
            this.ioWrites++
        } else {
            throw new Error("unknown IO op")
        }
    }
}
