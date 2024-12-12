import LogId from './log-id';
import { LOG_TYPE_MAP, LogType } from './types';

export const SCHEMA = {
    type: 'object',
    properties: {
        logId: {
            type: 'string',
        },
        master: {
            type: 'string',
        },
        replicas: {
            type: 'array',
            items: {
                type: 'string',
            },
        },
        type: {
            type: 'string',
            enum: ['binary', 'json'],
        }
    },
    requires: ['type'],
}
export default class LogConfig {
    logId: LogId
    master: string
    replicas: string[]
    type: LogType

    constructor({
        logId,
        master,
        replicas,
        type,
    }: {
        logId: LogId,
        master: string,
        replicas?: string[]
        type: string
    }) {
        if (LOG_TYPE_MAP[type]) {
            this.type = LOG_TYPE_MAP[type]
        }
        else {
            throw new Error(`Unknown log type: ${type}`)
        }
        this.logId = logId
        this.master = master
        this.replicas = replicas ? replicas : []
    }
}
