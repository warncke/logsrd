import uWS, { HttpResponse } from "uWebSockets.js"

import CommandLogEntry from "./lib/entry/command-log-entry"
import GlobalLogEntryFactory from "./lib/entry/global-log-entry-factory"
import { GLOBAL_LOG_PREFIX_BYTE_LENGTH, MAX_ENTRY_SIZE } from "./lib/globals"
import { ProtectedProperties } from "./lib/log/log-config"
import LogId from "./lib/log/log-id"
import Server from "./lib/server"

const dataDir = process.env.DATA_DIR || "./data"
const host = process.env.HOST || "127.0.0.1"
const hosts = (process.env.HOSTS || "").split(" ").filter((host) => host.length > 0)
const hostMonitorInterval = parseInt(process.env.HOST_MONITOR_INTERVAL || "10000")
const port = parseInt(process.env.PORT || "7000")
const replicatePath = process.env.REPLICATE_PATH || "/replicate"
const replicateTimeout = parseInt(process.env.REPLICATE_TIMEOUT || "3000")
const secret = process.env.SERVER_SECRET || "secret"
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
const INVALID_LAST_ENTRY_NUM_ERROR = "Invalid lastEntryNum"
const INVALID_LAST_CONFIG_NUM_ERROR = "Invalid lastConfigNum"

const NO_ENTRIES_INFO = "No entries"

async function run(): Promise<void> {
    const config = {
        host: `${host}:${port}`,
        dataDir,
        pageSize: 4096,
        globalIndexCountLimit: 100_000,
        globalIndexSizeLimit: 1024 * 1024 * 100,
        hosts,
        hostMonitorInterval,
        replicatePath,
        replicateTimeout,
        secret,
    }
    const server = new Server(config)
    await server.init()

    const logsrd = uWS.App()

    /* Public Routes */

    logsrd.post("/log", (res, req) => createLog(server, res, req))
    logsrd.post("/log/:logid", (res, req) => appendLog(server, res, req))
    logsrd.get("/log/:logid/config", (res, req) => getConfig(server, res, req))
    logsrd.patch("/log/:logid/config", (res, req) => setConfig(server, res, req))
    logsrd.get("/log/:logid/head", (res, req) => getHead(server, res, req))
    logsrd.get("/log/:logid/entries", (res, req) => getEntries(server, res, req))

    /* replication WebSocket */
    logsrd.ws(`/${replicatePath}`, {
        compression: 0,
        idleTimeout: 60,
        maxLifetime: 0,
        maxPayloadLength: MAX_ENTRY_SIZE + GLOBAL_LOG_PREFIX_BYTE_LENGTH,

        upgrade: (res, req, context) => {
            if (req.getHeader("x-server-secret") !== secret) {
                res.cork(() => {
                    res.writeStatus("404")
                    res.end("Not found")
                })
                return
            }

            res.upgrade(
                {},
                req.getHeader("sec-websocket-key"),
                req.getHeader("sec-websocket-protocol"),
                req.getHeader("sec-websocket-extensions"),
                context,
            )
        },
        open: (ws) => {
            // nothing to do here yet
        },
        message: async (ws, message, isBinary) => {
            // for binary all incoming messages must be global log entries
            if (isBinary) {
                let entry
                try {
                    entry = GlobalLogEntryFactory.fromU8(new Uint8Array(message.slice(0)))
                } catch (err: any) {
                    ws.send(`err:unknown:${err.message}`)
                    return
                }
                try {
                    entry = await server.appendReplica(entry)
                    ws.send(`ok:${entry.key()}`)
                } catch (err: any) {
                    ws.send(`err:${entry.key()}:${err.message}`)
                }
            }
        },
        drain: (ws) => {
            // unsafely ignore this for now
        },
        close: (ws, code, message) => {
            // nothing to do here yet
        },
    })

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
    logsrd.any("/*", (res) => {
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

function getToken(req: uWS.HttpRequest): string | null {
    const authorization = req.getHeader("authorization")
    if (!authorization.startsWith("Bearer ")) {
        return null
    }
    return authorization.slice(7)
}

function filterProtectedProperties(obj: any) {
    return Object.fromEntries(
        Object.entries(obj).filter(([key]) => {
            return !ProtectedProperties.includes(key)
        }),
    )
}

function readPost(res: HttpResponse, cb: (data: Uint8Array) => void) {
    let buffer: Buffer
    /* Register data cb */
    res.onData((ab, isLast) => {
        let chunk = Buffer.from(ab)
        if (isLast) {
            if (buffer) {
                if (buffer.length + chunk.length > MAX_ENTRY_SIZE) {
                    // hard stop connection - no response
                    res.close()
                }
                // copy here because buffer may become detached - this sucks but can
                // be optimized later
                const u8 = new Uint8Array(buffer.length + chunk.length)
                u8.set(buffer)
                u8.set(chunk, buffer.length)
                cb(u8)
            } else {
                if (chunk.length > MAX_ENTRY_SIZE) {
                    // hard stop connection - no response
                    res.close()
                }
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
}

async function createLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    res.onAborted(() => {
        res.aborted = true
    })

    /* Read the body until done or error */
    readPost(res, async (data: Uint8Array) => {
        if (res.aborted) return

        if (data.length > MAX_ENTRY_SIZE) {
            res.cork(() => {
                res.writeStatus("400")
                res.end(MAX_POST_SIZE_ERROR)
            })
            return
        }
        let config: any
        try {
            if (data.length === 0) {
                config = {}
            } else {
                config = JSON.parse(new TextDecoder().decode(data))
            }
        } catch (err: any) {
            res.cork(() => {
                res.writeStatus("400")
                res.end(INVALID_JSON_POST_ERROR)
            })
            return
        }
        try {
            const entry = await server.createLog(config)

            if (res.aborted) return
            res.cork(() => {
                res.end(entry.entry.u8())
            })
        } catch (err: any) {
            if (res.aborted) return

            res.cork(() => {
                res.writeStatus("400")
                const ret: any = { error: err.message, stack: err.stack }
                if (err.errors) {
                    ret.schemaErrors = err.errors.map((err: any) => err.message)
                }
                res.end(JSON.stringify(ret))
            })
        }
    })
}

async function appendLog(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    const logIdBase64 = req.getParameter(0)
    const token = getToken(req)
    const lastEntryNumParam = req.getQuery("lastEntryNum")
    let lastEntryNum: number | null = null

    res.onAborted(() => {
        res.aborted = true
    })

    if (lastEntryNumParam && lastEntryNumParam.length > 0) {
        if (parseInt(lastEntryNumParam).toString() === lastEntryNumParam) {
            lastEntryNum = parseInt(lastEntryNumParam)
        } else {
            if (res.aborted) return

            res.cork(() => {
                res.writeStatus("400")
                res.end(JSON.stringify({ error: INVALID_LAST_ENTRY_NUM_ERROR }))
            })
        }
    }

    if (!logIdBase64 || logIdBase64.length !== 22) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("404")
            res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR }))
        })
        return
    }

    /* Read the body until done or error */
    readPost(res, async (data: Uint8Array) => {
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

            const entry = await server.appendLog(logId, token, data, lastEntryNum)

            if (res.aborted) return

            res.cork(() => {
                res.end(JSON.stringify({ entryNum: entry.entryNum, crc: entry.cksumNum }))
            })
        } catch (err: any) {
            if (res.aborted) return
            // TODO: do something about this shitty error handling
            if (err.message === "Access denied") {
                res.cork(() => {
                    res.writeStatus("403")
                    res.end(JSON.stringify({ error: err.message }))
                })
            } else if (lastEntryNum !== null && err.message === "lastEntryNum mismatch") {
                res.cork(() => {
                    res.writeStatus("409")
                    res.end(JSON.stringify({ error: err.message }))
                })
            } else {
                res.cork(() => {
                    res.writeStatus("400")
                    res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                })
            }
        }
    })
}

async function getConfig(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    let contentType = req.getHeader("content-type")
    const expectJSON = contentType.startsWith("application/json")
    const logIdBase64 = req.getParameter(0)
    const token = getToken(req)
    const meta = req.getQuery("meta") === "true"

    res.onAborted(() => {
        res.aborted = true
    })

    if (!logIdBase64 || logIdBase64.length !== 22) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("404")
            expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
        })
        return
    }

    try {
        const logId = LogId.newFromBase64(logIdBase64)

        const { allowed, entry } = await server.getConfig(logId, token)

        if (res.aborted) return

        res.cork(() => {
            if (meta) {
                res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                res.write(JSON.stringify(filterProtectedProperties((entry.entry as CommandLogEntry).value())))
                res.end("}")
            } else {
                res.end(JSON.stringify(filterProtectedProperties((entry.entry as CommandLogEntry).value())))
            }
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

async function setConfig(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    const logIdBase64 = req.getParameter(0)
    const token = getToken(req)
    const lastConfigNum = parseInt(req.getQuery("lastConfigNum")!)

    res.onAborted(() => {
        res.aborted = true
    })

    if (!(lastConfigNum >= 0)) {
        if (res.aborted) return
        res.cork(() => {
            res.writeStatus("400")
            res.end(JSON.stringify({ error: INVALID_LAST_CONFIG_NUM_ERROR }))
        })
        return
    }

    if (!logIdBase64 || logIdBase64.length !== 22) {
        if (res.aborted) return
        res.cork(() => {
            res.writeStatus("404")
            res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR }))
        })
        return
    }

    /* Read the body until done or error */
    readPost(res, async (data: Uint8Array) => {
        if (data.length > MAX_ENTRY_SIZE) {
            if (res.aborted) return
            res.cork(() => {
                res.writeStatus("400")
                res.end(MAX_POST_SIZE_ERROR)
            })
            return
        }

        let config: any
        try {
            config = JSON.parse(new TextDecoder().decode(data))
        } catch (err: any) {
            if (res.aborted) return
            res.cork(() => {
                res.writeStatus("400")
                res.end(INVALID_JSON_POST_ERROR)
            })
            return
        }

        try {
            const logId = LogId.newFromBase64(logIdBase64)

            const entry = await server.setConfig(logId, token, config, lastConfigNum)

            if (res.aborted) return

            res.cork(() => {
                res.end(JSON.stringify(filterProtectedProperties((entry.entry as CommandLogEntry).value())))
            })
        } catch (err: any) {
            if (res.aborted) return
            // TODO: do something about this shitty error handling
            if (err.message === "Access denied") {
                res.cork(() => {
                    res.writeStatus("403")
                    res.end(JSON.stringify({ error: err.message }))
                })
            } else if (err.message === "lastConfigNum mismatch") {
                res.cork(() => {
                    res.writeStatus("409")
                    res.end(JSON.stringify({ error: err.message }))
                })
            } else {
                res.cork(() => {
                    res.writeStatus("400")
                    res.end(JSON.stringify({ error: err.message, stack: err.stack }))
                })
            }
        }
    })
}

async function getHead(server: Server, res: uWS.HttpResponse, req: uWS.HttpRequest) {
    let contentType = req.getHeader("content-type")
    const expectJSON = contentType.startsWith("application/json")
    const logIdBase64 = req.getParameter(0)
    const token = getToken(req)
    const meta = req.getQuery("meta") === "true"

    res.onAborted(() => {
        res.aborted = true
    })

    if (!logIdBase64 || logIdBase64.length !== 22) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("404")
            expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
        })
        return
    }

    try {
        const logId = LogId.newFromBase64(logIdBase64)

        const { allowed, entry } = await server.getHead(logId, token)

        if (res.aborted) return

        res.cork(() => {
            if (meta) {
                if (entry.entry instanceof CommandLogEntry) {
                    if (allowed.admin) {
                        res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                        res.write(JSON.stringify(filterProtectedProperties(entry.entry.value())))
                        res.end("}")
                    } else {
                        res.end(`{"entryNum":${entry.entryNum},"entry":{}}`)
                    }
                } else {
                    if (allowed.read) {
                        res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                        res.write(entry.u8())
                        res.end("}")
                    } else {
                        res.end(`{"entryNum":${entry.entryNum},"entry":{}}`)
                    }
                }
            } else {
                if (entry.entry instanceof CommandLogEntry) {
                    if (allowed.admin) {
                        res.end(JSON.stringify(filterProtectedProperties(entry.entry.value())))
                    } else {
                        res.end("{}")
                    }
                } else {
                    if (allowed.read) {
                        res.end(entry.u8())
                    } else {
                        res.end("{}")
                    }
                }
            }
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
    const token = getToken(req)
    const offset = req.getQuery("offset")
    const limit = req.getQuery("limit")
    const entryNums = req.getQuery("entryNums")
    const meta = req.getQuery("meta") === "true"

    res.onAborted(() => {
        res.aborted = true
    })

    if (!logIdBase64 || logIdBase64.length !== 22) {
        if (res.aborted) return

        res.cork(() => {
            res.writeStatus("404")
            expectJSON ? res.end(JSON.stringify({ error: INVALID_LOG_ID_ERROR })) : res.end(INVALID_LOG_ID_ERROR)
        })
        return
    }

    try {
        const logId = LogId.newFromBase64(logIdBase64)
        const log = server.getLog(logId)
        // TODO: this should be streaming instead of buffering everything
        const config = await log.getConfig()
        const { allowed, entries } = await server.getEntries(logId, token, entryNums, offset, limit)

        if (res.aborted) return

        if (config.type === "json") {
            res.cork(() => {
                res.writeHeader("Content-Type", "application/json")
                res.write("[")
                for (let i = 0; i < entries.length; i++) {
                    const entry = entries[i]
                    if (meta) {
                        if (entry.entry instanceof CommandLogEntry) {
                            if (allowed.admin) {
                                res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                                res.write(JSON.stringify(filterProtectedProperties(entry.entry.value())))
                                res.write("}")
                            } else {
                                res.write(`{"entryNum":${entry.entryNum},"entry":{}}`)
                            }
                        } else {
                            if (allowed.read) {
                                res.write(`{"entryNum":${entry.entryNum},"crc":${entry.cksumNum},"entry":`)
                                res.write(entry.u8())
                                res.write("}")
                            } else {
                                res.write(`{"entryNum":${entry.entryNum},"entry":{}}`)
                            }
                        }
                    } else {
                        if (entry.entry instanceof CommandLogEntry) {
                            if (allowed.admin) {
                                res.write(JSON.stringify(filterProtectedProperties(entry.entry.value())))
                            } else {
                                res.write("{}")
                            }
                        } else {
                            if (allowed.read) {
                                res.write(entry.u8())
                            } else {
                                res.write("{}")
                            }
                        }
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
