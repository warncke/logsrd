export default class LogEntry {
    cksumNum: number = 0

    constructor() {}

    u8(): Uint8Array {
        throw new Error("Not implemented")
    }

    u8s(): Uint8Array[] {
        return []
    }

    byteLength(): number {
        return 0
    }

    cksum(entryNum: number): number {
        return 0
    }

    // entry types with fixed length should override this
    // 0 means variable length entry
    static expectedByteLength: number = 0

    /**
     * Create a new LogEntry of the correct class from the input buffer.
     * Input buffer must contain complete entry and will throw error if invalid.
     */
    static fromU8(u8: Uint8Array): LogEntry {
        throw new Error("Not implemented")
    }

    /**
     * For use when reading from disk or network where buffer may not contain the
     * entire entry. Does not throw errors if implemented. Returns an object with
     * either the complete entry, an error if the existing data is invalid, or
     * the number of bytes needed to complete the entry. needBytes is only based
     * on the entry data available up to that point so further calls with the bytes
     * needed may still need more bytes.
     */
    static fromPartialU8(u8: Uint8Array): {
        entry?: LogEntry | null
        needBytes?: number
        err?: Error
    } {
        throw new Error("Not implemented")
    }
}
