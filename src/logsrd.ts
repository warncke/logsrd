import uWS, { HttpResponse } from "uWebSockets.js"

import Log from "./lib/log"
import LogId from "./lib/log-id"
import Persist from "./lib/persist"
import Server from "./lib/server"

const dataDir = process.env.DATA_DIR || "./data"
const host = process.env.HOST || "127.0.0.1"
const port = parseInt(process.env.PORT || "7000")
const version = "0.0.1"

run().catch(console.error)

const JSON_REQUIRED_ERROR = "Content-Type: application/json required"
const LOG_CREATE_ERROR = "Failed to create log"
const INVALID_JSON_POST_ERROR = "Aborted: invalid JSON or no data"
const INVALID_LOG_ID_ERROR = "Invalid log id"
const LOG_NOT_FOUND_ERROR = "Log not found"
const SERVER_ERROR = "Server error"

async function run(): Promise<void> {
    const persist = new Persist({
        dataDir,
        pageSize: 4096,
        diskCompactThreshold: 1024 ** 2,
        memCompactThreshold: 1024 ** 2 * 100,
    })

    await persist.init()

    const server = new Server({
        config: {
            host: `${host}:${port}`,
        },
        persist,
    })

    const logsrd = uWS.App({})

    /* Create Log */
    logsrd.post("/log", async (res, req) => {
        const contentType = req.getHeader("content-type")
        if (!contentType.startsWith("application/json")) {
            res.cork(() => {
                res.writeStatus("400")
                res.end(JSON_REQUIRED_ERROR)
            })
            return
        }

        /* Read the body until done or error */
        readJson(
            res,
            async (data: any) => {
                try {
                    const config = await server.createLog(data)
                    if (config === null) {
                        res.cork(() => {
                            res.writeStatus("400")
                            res.end(JSON.stringify({ error: LOG_CREATE_ERROR }))
                        })
                    } else {
                        res.cork(() => {
                            res.end(JSON.stringify(config))
                        })
                    }
                } catch (err: any) {
                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                    })
                }
            },
            () => {
                res.cork(() => {
                    res.writeStatus("400")
                    res.end(JSON.stringify({ error: INVALID_JSON_POST_ERROR }))
                })
            },
        )
    })

    /* Get Log Config */
    logsrd.get("/log/:logid/config", (res, req) => {
        let contentType = req.getHeader("content-type")
        const expectJSON = contentType.startsWith("application/json")
        const logIdBase64 = req.getParameter(0)

        if (!logIdBase64 || logIdBase64.length !== 22) {
            res.cork(() => {
                res.writeStatus("404")
                expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
            })
            return
        }

        const logId = LogId.newFromBase64(logIdBase64)
        server
            .getConfig(logId)
            .then((config) => {
                if (config === null) {
                    res.cork(() => {
                        res.writeStatus("404")
                        expectJSON
                            ? res.end(JSON.stringify({ error: LOG_NOT_FOUND_ERROR }))
                            : res.end(LOG_NOT_FOUND_ERROR)
                    })
                } else {
                    res.cork(() => {
                        res.end(JSON.stringify(config))
                    })
                }
            })
            .catch((err: any) => {
                res.cork(() => {
                    res.writeStatus("400")
                    expectJSON
                        ? res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                        : res.end(err.message)
                })
            })

        res.onAborted(() => {
            res.writeStatus("500")
            expectJSON ? res.end(JSON.stringify({ error: SERVER_ERROR })) : res.end(SERVER_ERROR)
        })
    })

    /* Get entry(s) from log */
    logsrd.get("/log/:logid", async (res, req) => {})

    /* Get current version from server */
    logsrd.get("/version", async (res, req) => {
        res.cork(() => {
            res.end(version)
        })
    })

    /* Unhandled Routes */
    logsrd.get("/*", (res, req) => {
        res.cork(() => {
            res.writeStatus("404")
            res.end("Not found")
        })
    })

    logsrd.listen(port, (token) => {
        if (token) {
            console.log("Listening to port " + port)
        } else {
            console.log("Failed to listen to port " + port)
        }
    })
}

function readJson(res: HttpResponse, cb: (data: any) => void, err: () => any) {
    let buffer: Buffer
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab)
        if (isLast) {
            let json
            if (buffer) {
                try {
                    json = JSON.parse(new TextDecoder().decode(Buffer.concat([buffer, chunk])))
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close()
                    return
                }
                cb(json)
            } else {
                try {
                    json = JSON.parse(new TextDecoder().decode(chunk))
                } catch (e) {
                    /* res.close calls onAborted */
                    res.close()
                    return
                }
                cb(json)
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk])
            } else {
                buffer = Buffer.concat([chunk])
            }
        }
    })

    /* Register error cb */
    res.onAborted(err)
}
