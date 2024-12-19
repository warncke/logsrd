import uWS, { HttpResponse, RecognizedString } from "uWebSockets.js"

import JSONLogEntry from "./lib/entry/json-log-entry"
import { MAX_ENTRY_SIZE } from "./lib/globals"
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
const INVALID_JSON_POST_ERROR = "Invalid JSON"
const INVALID_LOG_ID_ERROR = "Invalid log id"
const LOG_NOT_FOUND_ERROR = "Log not found"
const LOG_OR_HEAD_NOT_FOUND_ERROR = "Log not found or log has no entries"
const SERVER_ERROR = "Server error"
const MAX_POST_SIZE_ERROR = `Max post size ${MAX_ENTRY_SIZE} bytes exceeded`
const NO_ENTRIES_INFO = "No entries"

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

        let ABORTED = false
        res.onAborted(() => {
            ABORTED = true
        })

        /* Read the body until done or error */
        readPost(
            res,
            async (data: Uint8Array) => {
                if (ABORTED) return

                if (data.length > MAX_ENTRY_SIZE) {
                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(MAX_POST_SIZE_ERROR)
                    })
                    return
                }
                let jsonObj: any
                try {
                    jsonObj = JSON.parse(new TextDecoder().decode(data))
                } catch (err: any) {
                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(INVALID_JSON_POST_ERROR)
                    })
                    return
                }
                try {
                    const config = await server.createLog(jsonObj)

                    if (ABORTED) return

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
                    if (ABORTED) return

                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                    })
                }
            },
            () => {
                // invalid json or no data res is aborted now so no response can be given
            },
        )
    })

    /* Append Log */
    logsrd.post("/log/:logid", async (res, req) => {
        const logIdBase64 = req.getParameter(0)

        if (!logIdBase64 || logIdBase64.length !== 22) {
            res.cork(() => {
                res.writeStatus("404")
                res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR }))
            })
            return
        }
        const logId = LogId.newFromBase64(logIdBase64)

        let ABORTED = false
        res.onAborted(() => {
            ABORTED = true
        })

        /* Read the body until done or error */
        readPost(
            res,
            async (data: Uint8Array) => {
                if (ABORTED) return

                if (data.length > MAX_ENTRY_SIZE) {
                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(MAX_POST_SIZE_ERROR)
                    })
                    return
                }

                try {
                    const crc = await server.appendLog(logId, data)

                    if (ABORTED) return

                    if (crc === null) {
                        res.cork(() => {
                            res.writeStatus("404")
                            res.end(JSON.stringify({ error: LOG_CREATE_ERROR }))
                        })
                    } else {
                        res.cork(() => {
                            res.end(JSON.stringify({ crc }))
                        })
                    }
                } catch (err: any) {
                    if (ABORTED) return

                    res.cork(() => {
                        res.writeStatus("400")
                        res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                    })
                }
            },
            () => {
                // res aborted - no response possible
            },
        )
    })

    /* Get Log Config */
    logsrd.get("/log/:logid/config", async (res, req) => {
        let contentType = req.getHeader("content-type")
        const expectJSON = contentType.startsWith("application/json")
        const logIdBase64 = req.getParameter(0)

        let ABORTED = false

        if (!logIdBase64 || logIdBase64.length !== 22) {
            res.cork(() => {
                res.writeStatus("404")
                expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
            })
            return
        }
        const logId = LogId.newFromBase64(logIdBase64)

        res.onAborted(() => {
            ABORTED = true
        })
        try {
            const config = await server.getConfig(logId)

            if (ABORTED) return

            if (config === null) {
                res.cork(() => {
                    res.writeStatus("404")
                    expectJSON ? res.end(JSON.stringify({ error: LOG_NOT_FOUND_ERROR })) : res.end(LOG_NOT_FOUND_ERROR)
                })
            } else {
                res.cork(() => {
                    res.end(JSON.stringify(config))
                })
            }
        } catch (err: any) {
            if (ABORTED) return

            res.cork(() => {
                res.writeStatus("400")
                expectJSON ? res.end(JSON.stringify({ error: err.message, stack: err.stack })) : res.end(err.message)
            })
        }
    })

    /* Get last entry from log */
    logsrd.get("/log/:logid/head", async (res, req) => {
        let contentType = req.getHeader("content-type")
        const expectJSON = contentType.startsWith("application/json")
        const logIdBase64 = req.getParameter(0)

        let ABORTED = false

        if (!logIdBase64 || logIdBase64.length !== 22) {
            res.cork(() => {
                res.writeStatus("404")
                expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
            })
            return
        }
        const logId = LogId.newFromBase64(logIdBase64)

        res.onAborted(() => {
            ABORTED = true
        })
        try {
            const entry = await server.getHead(logId)

            if (ABORTED) return

            if (entry === null) {
                res.cork(() => {
                    res.writeStatus("404")
                    expectJSON
                        ? res.end(JSON.stringify({ error: LOG_OR_HEAD_NOT_FOUND_ERROR }))
                        : res.end(LOG_OR_HEAD_NOT_FOUND_ERROR)
                })
            } else {
                res.cork(() => {
                    res.end(entry instanceof JSONLogEntry ? entry.jsonU8() : entry.u8)
                })
            }
        } catch (err: any) {
            if (ABORTED) return

            res.cork(() => {
                res.writeStatus("400")
                expectJSON ? res.end(JSON.stringify({ error: err.message, stack: err.stack })) : res.end(err.message)
            })
        }
    })

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
            console.error("Listening to port " + port)
        } else {
            console.error("Failed to listen to port " + port)
        }
    })
}

function readPost(res: HttpResponse, cb: (data: Uint8Array) => void, err: () => any) {
    let buffer: Buffer
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab)
        if (isLast) {
            if (buffer) {
                // copy here because buffer may become detached - this sucks but can
                // be optimized later
                const u8 = new Uint8Array(buffer.length + chunk.length)
                u8.set(buffer)
                u8.set(chunk, buffer.length)
                cb(u8)
            } else {
                const u8 = new Uint8Array(chunk.length)
                u8.set(chunk)
                cb(u8)
            }
        } else {
            if (buffer) {
                buffer = Buffer.concat([buffer, chunk])
                if (buffer.length > MAX_ENTRY_SIZE) {
                    // hard stop connection - no response
                    res.close()
                }
            } else {
                buffer = Buffer.concat([chunk])
            }
        }
    })

    /* Register error cb */
    res.onAborted(err)
}
