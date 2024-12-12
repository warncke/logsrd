import fs from 'node:fs/promises'

import HotLog from "./hot-log";
import ColdLog from "./cold-log";
import WriteQueue from "./write-queue";
import BeginWriteCommand from './entry/command/begin-write-command';
import EndWriteCommand from './entry/command/end-write-command';

export default class GlobalLogWriter {
    static async write(log: HotLog | ColdLog) {
        if (log.writeInProgress) {    
            return
        }
        if (log.writeQueue === null) {
            log.writeQueue = new WriteQueue()
            return
        }
        if (log.writeQueue.queue.length === 0) {
            return
        }

        const writeQueue = log.writeInProgress = log.writeQueue!
        log.writeQueue = new WriteQueue()

        try {
            if (log.fh === null) {
                log.fh = await fs.open(log.logFile, 'a')
            }
            // create index of offset and length of every write which will
            // be added to the hot/cold log index if all writes are successful
            const logs: Map<string, Array<number>> = new Map()
            // create begin write command that will be written first
            // correct size value will be set after calculating from write queue
            const beginWrite = new BeginWriteCommand({value: 0})
            // build list of all buffers to write
            const u8s: Uint8Array[] = [
                ...beginWrite.u8s()
            ]
            // get total length of this write
            let totalBytes = beginWrite.byteLength()
            // add all items from queue to list of u8s to write
            for (const item of writeQueue.queue) {
                // add logId buffer first
                totalBytes += item.logId.byteLength()
                u8s.push(item.logId.logId)
                // get combined length of all u8s in LogEntry
                const byteLength = item.entry.byteLength()
                const lengthBytes = new Uint8Array(
                    new Uint16Array([byteLength]).buffer
                )
                // add length bytes before entry data
                totalBytes += lengthBytes.byteLength
                u8s.push(lengthBytes)
                // add offset and length of entry to index
                if (logs.has(item.logId.base64())) {
                    const offsets = logs.get(item.logId.base64())
                    offsets!.push(totalBytes, byteLength)
                }
                else {
                    logs.set(item.logId.base64(), [totalBytes, byteLength])
                }
                // add entry data
                u8s.push(...item.entry.u8s())
                totalBytes += byteLength
                // add length bytes after entry data
                totalBytes += lengthBytes.byteLength
                u8s.push(lengthBytes)
            }
            // get bytes for entries not including begin/end write commands
            const entryBytes = totalBytes - beginWrite.byteLength()
            // set total entry bytes written
            beginWrite.setValue(entryBytes)
            // add end write command with entry bytes written
            u8s.push(
                ...new EndWriteCommand({value: entryBytes}).u8s()
            )
            // write buffers
            await log.fh.writev(u8s)
            // sync data only as we do not care about metadata
            await log.fh.datasync()
            // update hot/cold log index with added offsets
            for (const [logId, offsets] of logs) {
                if (log.logs.has(logId)) {
                    log.logs.get(logId)!.push(...offsets)
                }
                else {
                    log.logs.set(logId, offsets)
                }
            }
            if (writeQueue.resolve !== null) {
                writeQueue.resolve()
            }
        } catch (err) {
            console.error(err)
            // TODO: handle error appropriately
            if (writeQueue.reject !== null) writeQueue.reject(err)
        }
        // set this queue to null because it has been written now
        log.writeInProgress = null
        // if new write queue has any items then process it on next tick
        if (log.writeQueue !== null && log.writeQueue.queue.length > 0) {
            setTimeout(() => GlobalLogWriter.write(log), 0)
        }
    }
}