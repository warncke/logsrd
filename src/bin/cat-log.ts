import Persist from "../lib/persist"

const dataDir = process.env.DATA_DIR || "./data"

run().catch(console.error)

async function run() {
    const log = process.argv[2] || "newHotLog"

    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        diskCompactThreshold: 1024 ** 2,
        memCompactThreshold: 1024 ** 2 * 100,
    })

    // @ts-ignore
    await persist[log].init()
    // @ts-ignore
    console.log(persist.logs)
}
