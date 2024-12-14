import { CommandName } from "../types"
import CommandLogEntry from "./command-log-entry"
import BeginWriteCommand from "./command/begin-write-command"
import CreateLogCommand from "./command/create-log-command"
import EndWriteCommand from "./command/end-write-command"
import SetConfigCommand from "./command/set-config-command"

type COMMAND_CLASSES =
    | typeof CreateLogCommand
    | typeof SetConfigCommand
    | typeof BeginWriteCommand
    | typeof EndWriteCommand

const COMMAND_CLASS: { [index: number]: COMMAND_CLASSES } = {
    [CommandName.CREATE_LOG]: CreateLogCommand,
    [CommandName.SET_CONFIG]: SetConfigCommand,
    [CommandName.BEGIN_WRITE]: BeginWriteCommand,
    [CommandName.END_WRITE]: EndWriteCommand,
}

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
