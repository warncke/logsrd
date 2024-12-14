import { EntryType, Writable } from "../globals"
import LogEntry from "../log-entry"
import LogEntryFactory from "../log-entry-factory"
import LogId from "../log-id"

const TYPE_BYTE = new Uint8Array([EntryType.GLOBAL_LOG])

// every entry is prefixed with 1 byte entry type + 16 byte logId + 2 byte length + 4 byte crc
export const PREFIX_BYTE_LENGTH = 23

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
        return PREFIX_BYTE_LENGTH + this.entry.byteLength()
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

    static fromPartialU8(u8: Uint8Array): {
        entry?: LogEntry | null
        needBytes?: number
        err?: Error
    } {
        // minimum length is 23 bytes for type + log id + length + crc
        if (u8.length < PREFIX_BYTE_LENGTH) {
            return { needBytes: PREFIX_BYTE_LENGTH - u8.length }
        }
        // get entry length
        const entryLength = new Uint16Array(u8.buffer.slice(u8.byteOffset + 17, u8.byteOffset + 19))[0]
        const totalLength = entryLength + PREFIX_BYTE_LENGTH
        if (u8.length < totalLength) {
            return { needBytes: totalLength - u8.length }
        }

        try {
            const logId = new LogId(new Uint8Array(u8.buffer, u8.byteOffset + 1, 16))
            const crc32 = new Uint8Array(u8.buffer.slice(u8.byteOffset + 19, u8.byteOffset + 23))
            const entry = LogEntryFactory.fromU8(u8)
            return { entry: new GlobalLogEntry({ logId, entry, crc32 }) }
        } catch (err: any) {
            return { err }
        }
    }
}
