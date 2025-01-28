import { log } from "console"
import WebSocket from "ws"

const logIdBase64 = process.env.LOG_ID || "4Pn28fADU1jXYzJu0dtqhg"
const token = process.env.TOKEN || "foo"

const ws = new WebSocket("ws://127.0.0.1:7000/client", {})

ws.on("error", console.error)

ws.on("open", function open() {
    ws.send(`sub:${logIdBase64}:${token}`)
})

ws.on("message", function message(data) {
    console.log("received: %s", data)
})
