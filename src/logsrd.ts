import uWS, { HttpResponse } from "uWebSockets.js"

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
const INVALID_ENTRY_TYPE_ERROR = "Invalid entry type"
const INVALID_LOG_TYPE_ERROR = "Invalid log type"

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

    /* Public Routes */

    logsrd.post("/log", (res, req) => createLog(server, res, req))
    logsrd.post("/log/:logid", (res, req) => appendLog(server, res, req))
    logsrd.get("/log/:logid/config", (res, req) => getConfig(server, res, req))
    logsrd.get("/log/:logid/head", (res, req) => getHead(server, res, req))
    logsrd.get("/log/:logid/entries", (res, req) => getEntries(server, res, req))

    /* Get current version from server */
    logsrd.get("/version", async (res) => {
        res.cork(() => {
            res.end(version)
        })
    })

    /**
     * !!! ADMIN ROUTES !!!
     *
     * These are used for testing and should be disabled or secured in production
     */
    logsrd.get("/admin/move-new-to-old-hot-log", (res, req) => adminMoveNewToOldHotLog(server, res, req))
    logsrd.get("/admin/empty-old-hot-log", (res, req) => adminEmptyOldHotLog(server, res, req))

    /* Unhandled Routes */
    logsrd.get("/*", (res) => {
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

async function createLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    const contentType = req.getHeader("content-type")
    if (!contentType.startsWith("application/json")) {
        res.cork(() => {
            res.writeStatus("400")
            res.end(JSON_REQUIRED_ERROR)
        })
        return
    }

    res.onAborted(() => {
        res.aborted = true
    })

    /* Read the body until done or error */
    readPost(
        res,
        async (data: Uint8Array) => {
            if (res.aborted) return

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

                if (res.aborted) return

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
                if (res.aborted) return

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
}

async function appendLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    const logIdBase64 = req.getParameter(0)

    if (!logIdBase64 || logIdBase64.length !== 22) {
        res.cork(() => {
            res.writeStatus("404")
            res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR }))
        })
        return
    }

    res.onAborted(() => {
        res.aborted = true
    })

    /* Read the body until done or error */
    readPost(
        res,
        async (data: Uint8Array) => {
            if (res.aborted) return

            if (data.length > MAX_ENTRY_SIZE) {
                res.cork(() => {
                    res.writeStatus("400")
                    res.end(MAX_POST_SIZE_ERROR)
                })
                return
            }

            try {
                const logId = LogId.newFromBase64(logIdBase64)

                const entry = await server.appendLog(logId, data)

                if (res.aborted) return

                res.cork(() => {
                    res.end(JSON.stringify({ entryNum: entry.entryNum, crc: entry.cksumNum }))
                })
            } catch (err: any) {
                if (res.aborted) return

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
}

async function getConfig(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
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

    res.onAborted(() => {
        res.aborted = true
    })
    try {
        const logId = LogId.newFromBase64(logIdBase64)

        const config = await server.getConfig(logId)

        if (res.aborted) return

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
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("400")
            expectJSON
                ? res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                : res.end(`${err.message} ${err.stack}`)
        })
    }
}

async function getHead(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
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

    res.onAborted(() => {
        res.aborted = true
    })
    try {
        const logId = LogId.newFromBase64(logIdBase64)

        const entry = await server.getHead(logId)

        if (res.aborted) return

        res.cork(() => {
            res.end(entry.u8())
        })
    } catch (err: any) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("400")
            expectJSON
                ? res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                : res.end(`${err.message} ${err.stack}`)
        })
    }
}

async function getEntries(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    let contentType = req.getHeader("content-type")
    const expectJSON = contentType.startsWith("application/json")
    const logIdBase64 = req.getParameter(0)
    const offset = req.getQuery("offset")
    const limit = req.getQuery("limit")
    const entryNums = req.getQuery("entryNums")
    const meta = req.getQuery("meta") === "true" ? true : false

    if (!logIdBase64 || logIdBase64.length !== 22) {
        res.cork(() => {
            res.writeStatus("404")
            expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
        })
        return
    }

    res.onAborted(() => {
        res.aborted = true
    })
    try {
        const logId = LogId.newFromBase64(logIdBase64)
        // TODO: this should be streaming instead of buffering everything
        const config = await server.getConfig(logId)
        const entries = await server.getEntries(logId, entryNums, offset, limit)

        if (res.aborted) return

        if (config.type === "json") {
            res.cork(() => {
                res.writeHeader("Content-Type", "application/json")
                res.write("[")
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    if (meta) {
                        res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                        res.write(entry.u8())
                        res.write("}")
                    } else {
                        res.write(entry.u8())
                    }
                    if (i < entries.length - 1) {
                        res.write(",")
                    }
                }
                res.end("]")
            })
        } else if (config.type === "binary") {
            res.cork(() => {
                for (const entry of entries) {
                    res.write(entry.u8())
                }
                res.end()
            })
        } else {
            res.cork(() => {
                res.writeStatus("404")
                expectJSON
                    ? res.end(JSON.stringify({ error: INVALID_LOG_TYPE_ERROR }))
                    : res.end(INVALID_LOG_TYPE_ERROR)
            })
            return
        }
    } catch (err: any) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("400")
            expectJSON
                ? res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                : res.end(`${err.message} ${err.stack}`)
        })
    }
}

async function adminMoveNewToOldHotLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    res.onAborted(() => {
        res.aborted = true
    })
    try {
        await server.persist.moveNewToOldHotLog()

        if (res.aborted) return

        res.cork(() => {
            res.end("done")
        })
    } catch (err: any) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("400")
            res.end(`${err.message} ${err.stack}`)
        })
    }
}

async function adminEmptyOldHotLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    res.onAborted(() => {
        res.aborted = true
    })
    try {
        await server.persist.emptyOldHotLog()

        if (res.aborted) return

        res.cork(() => {
            res.end("done")
        })
    } catch (err: any) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("400")
            res.end(`${err.message} ${err.stack}`)
        })
    }
}

// async function adminTruncateHotLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
//     res.onAborted(() => {
//         res.aborted = true
//     })
//     try {
//         if (res.aborted) return

//         res.cork(() => {
//             res.end("done")
//         })
//     } catch (err: any) {
//         if (res.aborted) return

//         res.cork(() => {
//             res.writeStatus("400")
//             res.end(`${err.message} ${err.stack}`)
//         })
//     }
// }
