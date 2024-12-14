import { crc32 } from "@node-rs/crc32";
import LogEntry from "../log-entry";
import { EntryType } from "../types";

const TYPE_BYTE = new Uint8Array([EntryType.COMMAND])
export default class CommandLogEntry extends LogEntry {
    commandNameU8: Uint8Array
    commandValueU8: Uint8Array

    constructor({
        commandNameU8,
        commandValueU8,
    }: {
        commandNameU8: Uint8Array,
        commandValueU8: Uint8Array
    }) {
        super()
        this.commandNameU8 = commandNameU8
        this.commandValueU8 = commandValueU8
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 1 byte command name + command.length
        return 2 + this.commandValueU8.byteLength
    }

    crc32(): Uint8Array {
        return new Uint8Array(new Uint32Array([crc32(this.commandValueU8, crc32(this.commandNameU8, crc32(TYPE_BYTE)))]).buffer)
    }

    u8s(): Uint8Array[] {
        return [ TYPE_BYTE,this.commandNameU8, this.commandValueU8 ]
    }

    static fromU8(u8: Uint8Array): LogEntry {
        throw new Error("Not implemented")
    }
}