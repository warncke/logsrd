import { EntryType, LOG_LOG_PREFIX_BYTE_LENGTH, Writable } from "../globals"
import LogEntry from "../log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.LOG_LOG])

export default class LogLogEntry extends LogEntry {
    entry: Writable
    crc32: Uint8Array | null

    constructor({ entry, crc32 }: { entry: Writable; crc32?: Uint8Array }) {
        super()
        this.entry = entry
        this.crc32 = crc32 ? crc32 : null
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 2 byte length + entry bytes... + 4 byte checksum
        return LOG_LOG_PREFIX_BYTE_LENGTH + this.entry.byteLength()
    }

    u8s(): Uint8Array[] {
        return [
            TYPE_BYTE,
            new Uint8Array(new Uint16Array([this.entry.byteLength()]).buffer),
            this.entry.cksum(),
            ...this.entry.u8s(),
        ]
    }

    verify(): boolean {
        return this.crc32 === null ? false : new Uint32Array(this.crc32)[0] === new Uint32Array(this.entry.cksum())[0]
    }
}
