import { LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import LogIndex from "./log-index"

export default class LogLogIndex extends LogIndex {
    commandByteLength(): number {
        let byteLength = 0
        for (let i = 0; i < this.cm.length; i += 3) {
            byteLength += this.cm[i + 2] - LOG_LOG_PREFIX_BYTE_LENGTH
        }
        return byteLength
    }

    entryByteLength(): number {
        let byteLength = 0
        for (let i = 0; i < this.en.length; i += 3) {
            byteLength += this.en[i + 2] - LOG_LOG_PREFIX_BYTE_LENGTH
        }
        return byteLength
    }

    totalByteLength(): number {
        return this.commandByteLength() + this.entryByteLength()
    }
}
