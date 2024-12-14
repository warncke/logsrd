import LogEntry from "../log-entry"
import LogId from "../log-id"
import { EntryType, Writable } from "../types"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG])

export default class GlobalLogEntry extends LogEntry {
    logId: LogId
    entry: Writable

    constructor({ logId, entry }: { logId: LogId; entry: Writable }) {
        super()
        this.logId = logId
        this.entry = entry
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 16 byte log id +
        // 2 byte length + entry bytes... + 4 byte checksum
        return 1 + 16 + 2 + this.entry.byteLength() + 4
    }

    u8s(): Uint8Array[] {
        return [
            TYPE_BYTE,
            this.logId.logId,
            new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer),
            ...this.entry.u8s(),
            this.entry.crc32(),
        ]
    }

    static fromU8(u8: Uint8Array): LogEntry {
        throw new Error("Not implemented")
    }
}
