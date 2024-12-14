import LogConfig from "../lib/log-config"
import LogId from "../lib/log-id"
import GlobalLogReader from "../lib/persist/global-log-reader"
import HotLog from "../lib/persist/hot-log"

run().catch(console.error)

async function run() {
    const logFile = process.argv[2]

    const log = new HotLog({
        config: new LogConfig({
            logId: new LogId(new Uint8Array(16)),
            master: "",
            type: "global",
        }),
        logFile,
    })
    await GlobalLogReader.initGlobal(log)
}
