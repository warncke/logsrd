import LogEntry from '../log-entry';
import PersistLog from './persist-log';

export default class Log {
    persist: PersistLog;

    constructor({ persist }: { persist: PersistLog }) {
        this.persist = persist;
    }

    async append(entry: LogEntry): Promise<void> {

    }

    async entries() {
        
    }

    async head() {

    }
}
