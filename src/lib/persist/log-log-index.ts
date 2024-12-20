import { LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import LogIndex from "./log-index"

export default class LogLogIndex extends LogIndex {
    byteLength(): number {
        let byteLength = 0
        for (let i = 0; i < this.en.length; i += 3) {
            byteLength += this.en[i + 2] - LOG_LOG_PREFIX_BYTE_LENGTH
        }
        return byteLength
    }
}
