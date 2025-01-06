import uWS from "uWebSockets.js"

import { MAX_ENTRY_SIZE } from "../globals"
import LogId from "../log-id"

export default class HttpPostRequest {
    req: uWS.HttpRequest
    res: uWS.HttpResponse
    contentType: string = ""
    contentLength: number = 0
    u8: Uint8Array | null = null
    logId: LogId | null = null

    constructor(req: uWS.HttpRequest, res: uWS.HttpResponse) {
        this.req = req
        this.res = res
    }

    init(cb: (err: any) => void) {
        this.contentType = this.req.getHeader("content-type")
        this.contentLength = parseInt(this.req.getHeader("content-length"))
        readPost(
            this.res,
            (u8) => {
                this.u8 = u8
                cb(null)
            },
            () => cb(new Error("Request aborted")),
        )
    }
}

function readPost(res: uWS.HttpResponse, cb: (data: Uint8Array) => void, err: () => any) {
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

    /* Register error cb */
    res.onAborted(err)
}
