import LogConfig from "../lib/log-config"
import LogId from "../lib/log-id"
import Persist from "../lib/persist"
import HotLog from "../lib/persist/persisted-log/hot-log"

const dataDir = process.env.DATA_DIR || "./data"

run().catch(console.error)

async function run() {
    const logFile = process.argv[2]

    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        diskCompactThreshold: 1024 ** 2,
        memCompactThreshold: 1024 ** 2 * 100,
    })

    const log = new HotLog({
        config: new LogConfig({
            logId: new LogId(new Uint8Array(16)),
            master: "",
            type: "global",
        }),
        logFile,
        persist,
    })

    await log.init()
}
