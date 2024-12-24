import Persist from "../lib/persist"

const dataDir = process.env.DATA_DIR || "./data"

run().catch(console.error)

async function run() {
    const log = process.argv[2] || "newHotLog"

    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        globalIndexCountLimit: 100_000,
        globalIndexSizeLimit: 1024 * 1024 * 100,
    })

    // @ts-ignore
    await persist[log].init()
    // @ts-ignore
    console.log(persist.logs)
}
