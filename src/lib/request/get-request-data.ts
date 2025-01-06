import uWS from "uWebSockets.js"

import { MAX_ENTRY_SIZE } from "../globals"
import HttpPostRequest from "./http-post-request"

export default function getRequestData(request: HttpRequestRequest): void {
    readPost(
        request.request.res,
        (data) => {},
        () => {},
    )
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
