import Log from './log';
import LogId from './log-id';

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
    },
}

export default class LogConfig {
    logId: LogId
    master: string
    replicas: string[]

    constructor({
        logId,
        master,
        replicas
    }: {
        logId: LogId,
        master: string,
        replicas?: string[]
    }) {
        this.logId = logId
        this.master = master
        this.replicas = replicas ? replicas : []
    }

    static fromJSON(configJSON: any) {

    }
}
