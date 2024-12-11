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
    constructor() {

    }

    static fromJSON(configJSON: any) {

    }
}
