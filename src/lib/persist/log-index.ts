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

    appendIndex(index: LogIndex) {
        // if appended index has more recent config then update
        if (index.lcOff !== null && (this.lcOff === null || index.lcOff > this.lcOff)) {
            this.lcOff = index.lcOff
            this.lcLen = index.lcLen
        }
        this.en.push(...index.en)
        this.cm.push(...index.cm)
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
