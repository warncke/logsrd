import { EntryType, GLOBAL_LOG_PREFIX_BYTE_LENGTH, Writable } from "../globals"
import LogEntry from "../log-entry"
import LogId from "../log-id"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG])

export default class GlobalLogEntry extends LogEntry {
    logId: LogId
    entry: Writable
    crc32: Uint8Array | null

    constructor({ logId, entry, crc32 }: { logId: LogId; entry: Writable; crc32?: Uint8Array }) {
        super()
        this.logId = logId
        this.entry = entry
        this.crc32 = crc32 ? crc32 : null
    }

    byteLength(): number {
        return GLOBAL_LOG_PREFIX_BYTE_LENGTH + this.entry.byteLength()
    }

    u8s(): Uint8Array[] {
        return [
            TYPE_BYTE,
            this.logId.logId,
            new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer),
            this.entry.cksum(),
            ...this.entry.u8s(),
        ]
    }

    verify(): boolean {
        return this.crc32 === null ? false : new Uint32Array(this.crc32)[0] === new Uint32Array(this.entry.cksum())[0]
    }
}
