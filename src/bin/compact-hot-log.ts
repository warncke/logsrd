import Persist from "../lib/persist"
import HotLogCompactor from "../lib/persist/hot-log-compactor"

const dataDir = process.env.DATA_DIR || "./data"

run().catch(console.error)

async function run(): Promise<void> {
    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        diskCompactThreshold: 1024 ** 2,
        memCompactThreshold: 1024 ** 2 * 100,
    })

    await persist.init()

    await HotLogCompactor.compactToCold(persist)

    if (persist.coldLog.writeFH !== null) await persist.coldLog.writeFH.close()
    if (persist.newHotLog.writeFH !== null) await persist.newHotLog.writeFH.close()
}
