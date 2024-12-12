import LogEntry from './log-entry';
import PersistLog from './persist-log';

export default class Log {
    deleting: boolean = false
    persist: PersistLog;

    constructor({ persist }: { persist: PersistLog }) {
        this.persist = persist;
    }

    async append(entry: LogEntry): Promise<void> {

    }

    async delete(): Promise<boolean> {
        if (this.deleting) {
            return false
        }
        this.deleting = true
        return this.persist.delete()
    }

    async entries() {
        
    }

    async head() {

    }
}
