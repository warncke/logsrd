import { ILogConfig, LOG_TYPE_MAP, LogType } from "./globals"
import LogId from "./log-id"

export const SCHEMA = {
    type: "object",
    properties: {
        logId: {
            type: "string",
        },
        master: {
            type: "string",
        },
        replicas: {
            type: "array",
            items: {
                type: "string",
            },
        },
        type: {
            type: "string",
            enum: ["binary", "json"],
        },
    },
    requires: ["type"],
}
export default class LogConfig implements ILogConfig {
    logId: LogId
    master: string
    replicas: string[]
    type: LogType
    // #jsonStr: string | null = null

    constructor({
        logId,
        master,
        replicas,
        type,
    }: {
        logId: LogId
        master: string
        replicas?: string[]
        type: string
    }) {
        if (LOG_TYPE_MAP[type]) {
            this.type = LOG_TYPE_MAP[type]
        } else {
            throw new Error(`Unknown log type: ${type}`)
        }
        this.logId = logId
        this.master = master
        this.replicas = replicas ? replicas : []
    }

    // toJSON(): string {
    //     if (this.#jsonStr === null) {
    //         this.#jsonStr = JSON.stringify(this)
    //     }
    //     return this.#jsonStr
    // }
}
