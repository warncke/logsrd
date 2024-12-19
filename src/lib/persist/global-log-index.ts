import CommandLogEntry from "../entry/command-log-entry"
import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import LogEntry from "../log-entry"

export default class GlobalLogIndex {
    // log entry logOffset, globalLogOffset, length, ....
    en: number[] = []
    // command logOffset, globalLogOffset, length, ....
    cm: number[] = []
    // logOffset, globalLogOffset, and length of last config entry
    lcLOff: number | null = null
    lcGOff: number | null = null
    lcLen: number | null = null

    constructor() {}

    addEntry(entry: LogEntry, logOffet: number, globalOffset: number, length: number): void {
        // create log and set config both store the current log config we only need most recent
        if (entry instanceof CreateLogCommand || entry instanceof SetConfigCommand) {
            // update last config if this entry is more recent
            if (this.lcLOff === null || logOffet > this.lcLOff) {
                this.lcLOff = logOffet
                this.lcGOff = globalOffset
                this.lcLen = length
            }
            // also add to command entries
            this.cm.push(logOffet, globalOffset, length)
        } else if (entry instanceof CommandLogEntry) {
            this.cm.push(logOffet, globalOffset, length)
        } else {
            this.en.push(logOffet, globalOffset, length)
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

    appendIndex(index: GlobalLogIndex) {
        // if appended index has more recent config then update
        if (index.lcLOff !== null && (this.lcLOff === null || index.lcLOff > this.lcLOff)) {
            this.lcLOff = index.lcLOff
            this.lcGOff = index.lcGOff
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
        return this.lcLOff !== null && this.lcGOff !== null && this.lcLen !== null
    }

    lastConfig(): [number, number, number] {
        if (!this.hasConfig()) {
            throw new Error("no last config")
        }
        return [this.lcLOff!, this.lcGOff!, this.lcLen!]
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

    logOffset(): number {
        if (this.en.length >= 3 && this.cm.length >= 3) {
            const enLogOffset = this.en.at(-3)!
            const enLogLength = this.en.at(-1)!
            const cmLogOffset = this.cm.at(-3)!
            const cmLogLength = this.cm.at(-1)!
            return enLogOffset > cmLogOffset ? enLogOffset + enLogLength : cmLogOffset + cmLogLength
        } else if (this.en.length >= 3) {
            const enLogOffset = this.en.at(-3)!
            const enLogLength = this.en.at(-1)!
            return enLogOffset + enLogLength
        } else if (this.cm.length >= 3) {
            const cmLogOffset = this.cm.at(-3)!
            const cmLogLength = this.cm.at(-1)!
            return cmLogOffset + cmLogLength
        } else {
            throw new Error("no log offset")
        }
    }
}
