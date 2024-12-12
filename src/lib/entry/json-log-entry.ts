import LogEntry, { EntryType } from "../log-entry";

const TYPE_BYTE = new Uint8Array([EntryType.JSON])

export default class JSONLogEntry extends LogEntry {
    json: string

    constructor(json: string) {
        super();
        this.json = json
    }

    static fromU8(u8: Uint8Array): JSONLogEntry {
        return new JSONLogEntry(
            new TextDecoder().decode(u8)
        )
    }
}