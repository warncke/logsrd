import CreateLogCommand from "../entry/command/create-log-command"
import SetConfigCommand from "../entry/command/set-config-command"
import LogEntry from "../entry/log-entry"

export default class LogIndex {
    // entry entryNum, offset, length, ....
    en: number[] = []
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
        }
        this.en.push(entryNum, offset, length)
    }

    hasEntry(entryNum: number): boolean {
        return entryNum >= this.en[0] && entryNum <= this.en.at(-3)!
    }

    entry(entryNum: number): [number, number, number] {
        if (entryNum < this.en[0] || entryNum > this.en.at(-3)!) {
            throw new Error(
                `entry not in index entryNum=${entryNum} minEntryNum=${this.en[0]} maxEntryNum=${this.en.at(-3)}`,
            )
        }
        const indexOffset = (entryNum - this.en[0]) * 3
        return [this.en[indexOffset], this.en[indexOffset + 1], this.en[indexOffset + 2]]
    }

    entries() {
        return this.en
    }

    entryCount(): number {
        return this.en.length / 3
    }

    appendIndex(index: LogIndex) {
        // if appended index has more recent config then update
        if (index.lcNum !== null && (this.lcNum === null || index.lcNum > this.lcNum)) {
            this.lcNum = index.lcNum
            this.lcOff = index.lcOff
            this.lcLen = index.lcLen
        }
        this.en.push(...index.en)
    }

    byteLength(prefixByteLength: number): number {
        let byteLength = 0
        for (let i = 0; i < this.en.length; i += 3) {
            byteLength += this.en[i + 2] - prefixByteLength
        }
        return byteLength
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

    lastEntry(): [number, number, number] {
        if (!this.hasEntries()) {
            throw new Error("no last entry")
        }
        return [this.en.at(-3)!, this.en.at(-2)!, this.en.at(-1)!]
    }

    maxEntryNum(): number {
        if (this.en.length >= 3) {
            return this.en.at(-3)!
        } else {
            throw new Error("no entries")
        }
    }
}
