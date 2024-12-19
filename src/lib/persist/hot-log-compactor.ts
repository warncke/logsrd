import fs from "node:fs/promises"

import BeginCompactColdCommand from "../entry/command/begin-compact-cold-command"
import { GLOBAL_LOG_PREFIX_BYTE_LENGTH, LOG_LOG_PREFIX_BYTE_LENGTH } from "../globals"
import Persist from "../persist"

export default class HotLogCompactor {
    /**
     * Compact entries for all logs without atleast pageSize bytes written to global cold log
     */
    static async compactToCold(persist: Persist): Promise<void> {
        // // cannot compact if write is blocked on cold log
        // if (persist.coldLog.writeBlocked !== null) {
        //     // this is probably an error because only compactor should write to cold log and
        //     // two compactors should not be running at the same time
        //     console.error("compactToCold called while write blocked on cold log")
        //     return
        // }
        // // we need to block writes on the cold log until we are done compacting
        // let resolve: ((value: void | PromiseLike<void>) => void) | null = null
        // let reject: ((reason?: any) => void) | null = null
        // persist.coldLog.writeBlocked = new Promise((res, rej) => {
        //     resolve = res
        //     reject = rej
        // })
        // return HotLogCompactor._compactToCold(persist)
        //     .catch((err) => {
        //         console.error(err)
        //         persist.coldLog.writeBlocked = null
        //         if (reject !== null) reject(err)
        //     })
        //     .then(() => {
        //         persist.coldLog.writeBlocked = null
        //         if (resolve !== null) resolve()
        //     })
    }

    // static async _compactToCold(persist: Persist): Promise<void> {
    //     // list of log ids that will be compacted
    //     const compactLogIds: string[] = []
    //     // list of [offset, length] arrays of each entry to be compacted
    //     const compactEntries: Array<Array<number>> = []
    //     // bytes of all entries to be compacted
    //     let compactByteLength = 0

    //     for (const [logId, logIndex] of persist.newHotLog.index.entries()) {
    //         // length as persisted to LogLog
    //         if (logIndex.totalByteLength(LOG_LOG_PREFIX_BYTE_LENGTH) > persist.config.pageSize) {
    //             // skip logs with data greater than pageSize
    //             continue
    //         }
    //         // length as persisted to GlobalLog which is same for hot and cold
    //         compactByteLength += logIndex.totalByteLength(GLOBAL_LOG_PREFIX_BYTE_LENGTH)
    //         compactLogIds.push(logId)
    //         const entries = logIndex.allEntries()
    //         // covert offset, length to [offset, length] to make it easy to sort combined list by offset
    //         for (let i = 0; i < entries.length; i += 2) {
    //             compactEntries.push([entries[i], entries[i + 1]])
    //         }
    //     }
    //     // there is nothing to compact
    //     if (compactByteLength === 0) {
    //         console.info("nothing to compact")
    //         return
    //     }
    //     // sort entries to be compacted ascending by offset
    //     compactEntries.sort((a, b) => a[0] - b[0])
    //     // create begin compact log entry which will be written to both hot and cold logs before starting
    //     const beginCompactCommand = new BeginCompactColdCommand({
    //         value: {
    //             offset: persist.coldLog.byteLength,
    //             byteLength: compactByteLength,
    //         },
    //     })

    //     // write begin compact log entry to both hot and cold logs
    //     // await Promise.all([
    //     //     persist.hotLog.writeFH.writev(beginCompactCommand.u8s()),
    //     //     persist.coldLog.writeFH.writev(beginCompactCommand.u8s()),
    //     // ])
    //     // combine adjacent entries to cut down the number of reads/writes needed
    //     // this could be optimized further but probably not a big deal
    //     const combinedEntries = [compactEntries[0]]
    //     for (let i = 1; i < compactEntries.length; i++) {
    //         const entry = compactEntries[i]
    //         const lastEntry = combinedEntries.at(-1)!
    //         if (lastEntry[0] + lastEntry[1] === entry[0]) {
    //             lastEntry[1] += entry[1]
    //         } else {
    //             combinedEntries.push(entry)
    //         }
    //     }

    //     console.log(compactEntries)
    //     console.log(combinedEntries)
    // }
}
