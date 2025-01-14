import crypto from "mz/crypto"

class LogId {
    #base64: string | null = null
    #logDirPrefix: string | null = null
    logId: Uint8Array

    constructor(logId: Uint8Array, base64?: string) {
        if (base64) {
            this.#base64 = base64
        }
        this.logId = logId
    }

    base64(): string {
        return this.#base64 !== null
            ? this.#base64
            : // TODO: browser compatibility
              (this.#base64 = Buffer.from(this.logId.buffer, this.logId.byteOffset, this.logId.byteLength).toString(
                  "base64url",
              ))
    }

    byteLength() {
        return this.logId.byteLength
    }

    u8s(): Uint8Array[] {
        return [this.logId]
    }

    toJSON() {
        return this.base64()
    }

    logDirPrefix() {
        if (this.#logDirPrefix !== null) {
            return this.#logDirPrefix
        }
        const dir1 = Buffer.from(this.logId.buffer, this.logId.byteOffset, 1)
            .toString("hex")
            .padStart(2, "0")
            .toLowerCase()
        const dir2 = Buffer.from(this.logId.buffer, this.logId.byteOffset + 1, 1)
            .toString("hex")
            .padStart(2, "0")
            .toLowerCase()
        this.#logDirPrefix = `${dir1}/${dir2}`
        return this.#logDirPrefix
    }

    static async newRandom(): Promise<LogId> {
        return new LogId(await crypto.randomBytes(16))
    }

    static newFromBase64(base64: string) {
        // TODO: browser compatibility
        const logIdU8 = new Uint8Array(Buffer.from(base64, "base64url"), 0, 16)
        const logId = new LogId(logIdU8)
        return logId
    }
}

export default LogId
