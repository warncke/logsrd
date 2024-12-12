import fs from 'node:fs/promises'

import HotLog from "./hot-log";
import ColdLog from "./cold-log";
import WriteQueue from "./write-queue";

export default class LogWriter {
    static async write(log: HotLog | ColdLog) {
        if (log.writeInProgress) {    
            return
        }
        const writeQueue = log.writeInProgress = log.writeQueue!
        log.writeQueue = new WriteQueue()

        try {
            if (log.fh === null) {
                log.fh = await fs.open(log.logFile, 'a')
            }

            if (writeQueue.resolve !== null) writeQueue.resolve()
        } catch (err) {
            if (writeQueue.reject !== null) writeQueue.reject(err)
        }
    }
}