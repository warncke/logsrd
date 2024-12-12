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
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // get total length of this write
            let totalBytes = 0
            for (const item of writeQueue.queue) {
                // add logId buffer first
                totalBytes += item.logId.byteLength()
                u8s.push(item.logId.logId)
                // get combined length of all u8s in LogEntry
                const byteLength = item.entry.byteLength()
                const lengthBytes = new Uint8Array(
                    new Uint16Array([byteLength]).buffer
                )
                // byte length is added before and after the data from entry so it adds 4 bytes
                totalBytes += byteLength + 4
                u8s.push(lengthBytes, ...item.entry.u8s(), lengthBytes)
            }
            // write buffers
            await log.fh.writev(u8s)
            // sync data only as we do not care about metadata
            await log.fh.datasync()
            if (writeQueue.resolve !== null) writeQueue.resolve()
        } catch (err) {
            // TODO: handle error appropriately
            if (writeQueue.reject !== null) writeQueue.reject(err)
        }

        log.writeInProgress = null
    }
}