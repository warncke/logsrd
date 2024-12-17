import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import LogEntry from "../log-entry"

export default class LogIndex {
    en: number[] = []
    cm: number[] = []
    lcOff: number | null = null
    lcLen: number | null = null

    constructor() {}

    addEntry(entry: LogEntry, offset: number, length: number): void {
        // create log and set config both store the current log config we only need most recent
        if (entry instanceof CreateLogCommand || entry instanceof SetConfigCommand) {
            // update last config if this entry is more recent
            if (this.lcOff === null || offset > this.lcOff) {
                this.lcOff = offset
                this.lcLen = length
            }
            // also add to command entries
            this.cm.push(offset, length)
        } else if (entry instanceof CommandLogEntry) {
            this.cm.push(offset, length)
        } else {
            this.en.push(offset, length)
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
                    allEntries.push(this.cm[cmIdx], this.cm[cmIdx + 1])
                    cmIdx += 2
                } else {
                    allEntries.push(this.en[enIdx], this.en[enIdx + 1])
                    enIdx += 2
                }
            } else if (cmIdx < this.cm.length) {
                allEntries.push(this.cm[cmIdx], this.cm[cmIdx + 1])
                cmIdx += 2
            } else if (enIdx < this.en.length) {
                allEntries.push(this.en[enIdx], this.en[enIdx + 1])
                enIdx += 2
            }
        }

        return allEntries
    }

    appendIndex(index: LogIndex) {
        // if appended index has more recent config then update
        if (index.lcOff !== null && (this.lcOff === null || index.lcOff > this.lcOff)) {
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
        for (let i = 0; i < this.cm.length; i += 2) {
            byteLength += this.cm[i + 1] - prefixByteLength
        }
        return byteLength
    }

    entryByteLength(prefixByteLength: number): number {
        let byteLength = 0
        for (let i = 0; i < this.en.length; i += 2) {
            byteLength += this.en[i + 1] - prefixByteLength
        }
        return byteLength
    }

    totalByteLength(prefixByteLength: number): number {
        return this.commandByteLength(prefixByteLength) + this.entryByteLength(prefixByteLength)
    }

    hasConfig(): boolean {
        return this.lcOff !== null
    }

    lastConfig(): [number, number] {
        if (this.lcOff === null || this.lcLen === null) {
            throw new Error("no last config")
        }
        return [this.lcOff, this.lcLen]
    }

    hasEntries(): boolean {
        return this.en.length >= 2
    }

    lastEntry(): [number, number] {
        if (this.en.length < 2) {
            throw new Error("no last entry")
        }
        return [this.en.at(-2)!, this.en.at(-1)!]
    }
}
