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
              (this.#base64 = Buffer.from(this.logId).toString("base64url"))
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
        return this.#logDirPrefix !== null
            ? this.#logDirPrefix
            : (this.#logDirPrefix = `${this.logId.at(0)!.toString(16).padStart(2, "0").toLowerCase()}/${this.logId.at(1)!.toString(16).padStart(2, "0").toLowerCase()}`)
    }

    static async newRandom(): Promise<LogId> {
        // generate new random id
        // TODO: browser compatibility
        return new LogId(await crypto.randomBytes(16))
    }

    static newFromBase64(base64: string) {
        // TODO: browser compatibility
        const logIdU8 = Buffer.from(base64, "base64url")
        if (logIdU8.byteLength === 16) {
            return new LogId(logIdU8, base64)
        } else {
            throw new Error("Invalid log id")
        }
    }
}

export default LogId
