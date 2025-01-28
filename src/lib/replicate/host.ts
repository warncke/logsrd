import WebSocket from "ws"

import GlobalLogEntry from "../entry/global-log-entry"
import Replicate from "../replicate"
import AppendReplica from "./append-replica"

export default class Host {
    host: string
    replicate: Replicate
    ws: WebSocket | null = null
    lastError: Error | null = null
    connectStart: number | null = null
    connectFinish: number | null = null
    lastPing: number | null = null
    lastPong: number | null = null
    inProgress: Map<string, AppendReplica> = new Map()

    constructor(replicate: Replicate, host: string) {
        this.host = host
        this.replicate = replicate
        this.connect()
        setInterval(() => {
            this.monitor()
        }, this.replicate.server.config.hostMonitorInterval)
    }

    async appendReplica(entry: GlobalLogEntry) {
        if (this.inProgress.has(entry.key())) {
            throw new Error(`appendReplica in progress host=${this.host} key=${entry.key()}`)
        }
        const appendReplica = new AppendReplica(this, entry)
        this.inProgress.set(entry.key(), appendReplica)
        this.send(appendReplica)
        await appendReplica.promise
    }

    connect() {
        if (this.ws !== null) {
            return
        }
        try {
            this.connectStart = Date.now()
            this.connectFinish = null
            this.ws = new WebSocket(`ws://${this.host}/${this.replicate.server.config.replicatePath}`, {
                headers: {
                    "x-server-secret": this.replicate.server.config.secret,
                },
                perMessageDeflate: false,
            })
            this.ws.on("error", (err) => {
                this.lastError = err
                this.ws = null
                if (this.connectFinish === null) {
                    this.connectFinish = Date.now()
                }
            })
            this.ws.on("open", () => {
                this.connectFinish = Date.now()
                this.lastError = null
                this.sendAll()
            })
            this.ws.on("message", (message, isBinary) => {
                if (isBinary) {
                    console.error("unknown message", message)
                } else {
                    const msg = new TextDecoder().decode(message as Buffer)
                    if (msg.startsWith("ok:")) {
                        const key = msg.substring(3)
                        if (this.inProgress.has(key)) {
                            const appendReplica = this.inProgress.get(key)!
                            appendReplica.complete()
                            this.inProgress.delete(key)
                        } else {
                            console.error(`inProgress not found host=${this.host} key=${key}`)
                        }
                    } else if (msg.startsWith("err:")) {
                        const [key, err] = msg.substring(4).split(":")
                        if (key === "unknown") {
                            console.error(`unknown key error host=${this.host} err=${err}`)
                        } else {
                            if (this.inProgress.has(key)) {
                                const appendReplica = this.inProgress.get(key)!
                                appendReplica.completeWithError(new Error(err))
                                this.inProgress.delete(key)
                            } else {
                                console.error(`inProgress not found host=${this.host} key=${key}`)
                            }
                        }
                    } else {
                        console.error("unknown message", msg)
                    }
                }
            })
            this.ws.on("pong", (message) => {
                this.lastPong = Date.now()
            })
        } catch (err) {
            console.error(err)
        }
    }

    monitor() {
        const now = Date.now()
        // check ws connection status and ping
        if (this.ws === null) {
            console.error(
                `no ws host=${this.host} start=${this.connectStart} finish=${this.connectFinish}`,
                this.lastError,
            )
            this.connect()
        } else {
            if (this.ws.readyState === WebSocket.OPEN) {
                if (this.lastPing !== null && (this.lastPong === null || this.lastPing! > this.lastPong!)) {
                    console.error(`no pong host=${this.host} lastPing=${this.lastPing} lastPong=${this.lastPong}`)
                    this.ws.terminate()
                    this.ws = null
                    this.connect()
                } else {
                    this.lastPing = now
                    this.ws.ping()
                }
            } else {
                if (this.connectStart === null) {
                    console.error(`not connected, no connect start host=${this.host}`, this.lastError)
                } else {
                    if (now - this.connectStart > this.replicate.server.config.replicateTimeout) {
                        console.error(`connect timeout, trying reconnect host=${this.host}`)
                        this.ws.terminate()
                        this.ws = null
                        this.connect()
                    }
                }
            }
        }
        // check timeout for appends in progress
        for (const [key, appendReplica] of this.inProgress) {
            if (now - appendReplica.start > this.replicate.server.config.replicateTimeout) {
                appendReplica.timeout()
                this.inProgress.delete(key)
            }
        }
    }

    send(appendReplica: AppendReplica) {
        if (appendReplica.sent) {
            return
        }
        if (this.ws === null) {
            this.connect()
            return
        }
        if (this.ws.readyState !== WebSocket.OPEN) {
            return
        }
        this.ws.send(Buffer.concat(appendReplica.entry.u8s()), { binary: true }, (err) => {
            if (err) {
                console.error("send error", err)
            }
        })
        appendReplica.sent = true
    }

    sendAll() {
        for (const appendReplica of this.inProgress.values()) {
            if (!appendReplica.sent) {
                this.send(appendReplica)
            }
        }
    }
}
