export default class LogEntry {
    constructor() {}

    u8s(): Uint8Array[] {
        return []
    }

    byteLength(): number {
        return 0
    }

    crc32(): Uint8Array {
        return new Uint8Array(new Uint32Array([0]).buffer)
    }

    // entry types with fixed length should override this
    // 0 means variable length entry
    static expectedByteLength: number = 0
}
