import crypto from 'mz/crypto';

class LogId {
    #base64: string | null = null;
    logId: any;

    constructor(logId: any) {
        this.logId = logId;
    }

    base64(): string {
        return this.#base64 !== null
            ? this.#base64
            : (this.#base64 = this.logId.toBase64({ alphabet: 'base64url', padding: false }));
    }

    static async newRandom(): Promise<LogId> {
        // generate new random id
        return new LogId(await crypto.randomBytes(64));
    }
}

export default LogId;
