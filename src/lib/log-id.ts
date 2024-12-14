import crypto from "mz/crypto"

class LogId {
    #base64: string | null = null
    logId: Uint8Array

    constructor(logId: Uint8Array) {
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

    static async newRandom(): Promise<LogId> {
        // generate new random id
        // TODO: browser compatibility
        return new LogId(await crypto.randomBytes(16))
    }
}

export default LogId
