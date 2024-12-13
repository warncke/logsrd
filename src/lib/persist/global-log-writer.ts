import fs from 'node:fs/promises'

import WriteQueue from "./write-queue";
import BeginWriteCommand from '../entry/command/begin-write-command';
import EndWriteCommand from '../entry/command/end-write-command';
import AbortWriteCommand from '../entry/command/abort-write-command';
import { AbortWriteError } from '../types';
import GlobalLog from './global-log';

export default class GlobalLogWriter {
    static async write(log: GlobalLog): Promise<void> {
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
            // build list of all buffers to write
            const u8s: Uint8Array[] = []
            // get total length of this write
            let totalBytes = 0
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
            // add begin write command that will be written first
            const beginWrite = new BeginWriteCommand({value: totalBytes})
            u8s.unshift(
                ...beginWrite.u8s()
            )
            // add end write command
            const endWrite = new EndWriteCommand({value: totalBytes})
            u8s.push(
                ...endWrite.u8s()
            )
            totalBytes += endWrite.byteLength()
            // write buffers
            const ret = await log.fh.writev(u8s)
            // sync data only as we do not care about metadata
            await log.fh.datasync()

            for (const [logId, offsets] of logs) {
                if (log.index.has(logId)) {
                    log.index.get(logId)!.push(...offsets)
                }
                else {
                    log.index.set(logId, offsets)
                }
            }

            if (writeQueue.resolve !== null) {
                writeQueue.resolve()
            }
        } catch (err) {
            // submitters waiting on write queue must be notified of error
            // this will cause their requests to error out. we do not
            // reattempt the same queue and truncate any partial write
            if (writeQueue.reject !== null) writeQueue.reject(err)
            // rethrow error to notify caller
            throw err
        }
        // set this queue to null because it has been written now. if an
        // error occurred this queue will stay in progress until it is
        // cleaned up preventing any further writes until the log is
        // trucated if a partial write occurred.
        log.writeInProgress = null
        // if new write queue has any items then process it on next tick
        if (log.writeQueue !== null && log.writeQueue.queue.length > 0) {
            setTimeout(() => GlobalLogWriter.write(log), 0)
        }
    }
}