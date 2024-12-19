import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import LogEntry from "../log-entry"

export default class LogIndex {
    // entry entryNum, offset, length, ....
    en: number[] = []
    // command entryNum, offset, length, ....
    cm: number[] = []
    // entryNum, offset, length of last config
    lcNum: number | null = null
    lcOff: number | null = null
    lcLen: number | null = null

    constructor() {}

    addEntry(entry: LogEntry, entryNum: number, offset: number, length: number): void {
        // create log and set config both store the current log config we only need most recent
        if (entry instanceof CreateLogCommand || entry instanceof SetConfigCommand) {
            // update last config if this entry is more recent
            if (this.lcNum === null || entryNum > this.lcNum) {
                this.lcNum = entryNum
                this.lcOff = offset
                this.lcLen = length
            }
            // also add to command entries
            this.cm.push(entryNum, offset, length)
        } else if (entry instanceof CommandLogEntry) {
            this.cm.push(entryNum, offset, length)
        } else {
            this.en.push(entryNum, offset, length)
        }
    }

    entries() {
        return this.en
    }

    commands() {
        return this.cm
    }

    allEntries() {
        // create merged array of all entries sorted ascending by offset
        const allEntries = []

        let cmIdx = 0
        let enIdx = 0

        while (cmIdx < this.cm.length || enIdx < this.en.length) {
            if (cmIdx < this.cm.length && enIdx < this.en.length) {
                if (this.cm[cmIdx] < this.en[enIdx]) {
                    allEntries.push(this.cm[cmIdx], this.cm[cmIdx + 1], this.cm[cmIdx + 2])
                    cmIdx += 3
                } else {
                    allEntries.push(this.en[enIdx], this.en[enIdx + 1], this.en[enIdx + 2])
                    enIdx += 3
                }
            } else if (cmIdx < this.cm.length) {
                allEntries.push(this.cm[cmIdx], this.cm[cmIdx + 1], this.cm[cmIdx + 2])
                cmIdx += 3
            } else if (enIdx < this.en.length) {
                allEntries.push(this.en[enIdx], this.en[enIdx + 1], this.en[enIdx + 2])
                enIdx += 3
            }
        }

        return allEntries
    }

    appendIndex(index: LogIndex) {
        // if appended index has more recent config then update
        if (index.lcNum !== null && (this.lcNum === null || index.lcNum > this.lcNum)) {
            this.lcNum = index.lcNum
            this.lcOff = index.lcOff
            this.lcLen = index.lcLen
        }
        this.en.push(...index.en)
        this.cm.push(...index.cm)
    }

    /**
     *
     * @param prefixByteLength depends on what type of log entry is stored in
     */
    commandByteLength(prefixByteLength: number): number {
        let byteLength = 0
        for (let i = 0; i < this.cm.length; i += 3) {
            byteLength += this.cm[i + 2] - prefixByteLength
        }
        return byteLength
    }

    entryByteLength(prefixByteLength: number): number {
        let byteLength = 0
        for (let i = 0; i < this.en.length; i += 3) {
            byteLength += this.en[i + 2] - prefixByteLength
        }
        return byteLength
    }

    totalByteLength(prefixByteLength: number): number {
        return this.commandByteLength(prefixByteLength) + this.entryByteLength(prefixByteLength)
    }

    hasConfig(): boolean {
        return this.lcNum !== null && this.lcOff !== null && this.lcLen !== null
    }

    lastConfig(): [number, number, number] {
        if (!this.hasConfig()) {
            throw new Error("no last config")
        }
        return [this.lcNum!, this.lcOff!, this.lcLen!]
    }

    hasEntries(): boolean {
        return this.en.length >= 3
    }

    hasAnyEntries(): boolean {
        return this.en.length >= 3 || this.cm.length >= 3
    }

    lastEntry(): [number, number, number] {
        if (!this.hasEntries()) {
            throw new Error("no last entry")
        }
        return [this.en.at(-3)!, this.en.at(-2)!, this.en.at(-1)!]
    }

    maxEntryNum(): number {
        if (this.en.length >= 3 && this.cm.length >= 3) {
            const enEntryNum = this.en.at(-3)!
            const cmEntryNum = this.cm.at(-3)!
            return enEntryNum > cmEntryNum ? enEntryNum : cmEntryNum
        } else if (this.en.length >= 3) {
            return this.en.at(-3)!
        } else if (this.cm.length >= 3) {
            return this.cm.at(-3)!
        } else {
            throw new Error("no log offset")
        }
    }
}
