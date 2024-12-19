import fs from "node:fs/promises"

import { PersistLogArgs } from "../../globals"
import LogId from "../../log-id"
import PersistedLog from "../persisted-log/persisted-log"

export default class LogLog extends PersistedLog {
    // index of offset, length of log entries. does not necessarily start with
    // zero because logs can be partially read from end.
    logId: LogId
    maxReadFHs: number = 4

    constructor({ logId, ...args }: PersistLogArgs & { logId: LogId }) {
        super(args)
        this.logId = logId
    }

    async init(): Promise<boolean> {
        try {
            const stat = await fs.stat(this.logFile)
            this.byteLength = stat.size
        } catch (err: any) {
            if (err.code !== "ENOENT") {
                throw err
            }
            return false
        }
        return true
    }
}
