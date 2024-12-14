import { COMMAND_CLASS } from "../globals"
import CommandLogEntry from "./command-log-entry"

export default class CommandLogEntryFactory {
    static fromU8(u8: Uint8Array): CommandLogEntry {
        const commandName: number | undefined = u8.at(0)

        if (commandName === undefined || !(commandName in COMMAND_CLASS)) {
            throw new Error(`Invalid commandName: ${commandName}`)
        } else {
            return new COMMAND_CLASS[commandName]({
                commandNameU8: new Uint8Array(u8.buffer, 0, 1),
                commandValueU8: new Uint8Array(
                    u8.buffer,
                    u8.byteOffset + 1,
                    u8.byteLength - 1,
                ),
            })
        }
    }
}
