import { crc32 } from "@node-rs/crc32"

import { EntryType } from "../globals"
import LogEntry from "../log-entry"

const TYPE_BYTE = new Uint8Array([EntryType.COMMAND])
export default class CommandLogEntry extends LogEntry {
    commandNameU8: Uint8Array
    commandValueU8: Uint8Array

    constructor({ commandNameU8, commandValueU8 }: { commandNameU8: Uint8Array; commandValueU8: Uint8Array }) {
        super()
        this.commandNameU8 = commandNameU8
        this.commandValueU8 = commandValueU8
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 1 byte command name + command.length
        return 2 + this.commandValueU8.byteLength
    }

    cksum(entryNum: number): number {
        if (this.cksumNum === 0) {
            this.cksumNum = crc32(this.commandValueU8, crc32(this.commandNameU8, crc32(TYPE_BYTE, entryNum)))
        }
        return this.cksumNum
    }

    u8s(): Uint8Array[] {
        return [TYPE_BYTE, this.commandNameU8, this.commandValueU8]
    }

    value() {
        throw new Error("Not implemented")
    }
}
