import LogEntry, { EntryType } from "../log-entry";
import CreateLogCommand from "./command/create-log-command";
import EndWriteCommand from "./command/end-write-command";
import SetConfigCommand from "./command/set-config-command";
import BeginWriteCommand from "./command/begin-write-command";

const TYPE_BYTE = new Uint8Array([EntryType.COMMAND])

export enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_WRITE,
    END_WRITE,
}

type COMMAND_CLASSES = 
    typeof CreateLogCommand     |
    typeof SetConfigCommand     |
    typeof BeginWriteCommand    |
    typeof EndWriteCommand

const COMMAND_CLASS: { [index: number]: COMMAND_CLASSES} = {
    [CommandName.CREATE_LOG]: CreateLogCommand,
    [CommandName.SET_CONFIG]: SetConfigCommand,
    [CommandName.BEGIN_WRITE]: BeginWriteCommand,
    [CommandName.END_WRITE]: EndWriteCommand,
}

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

    u8s(): Uint8Array[] {
        return [ TYPE_BYTE,this.commandNameU8, this.commandValueU8 ]
    }

    static fromU8(u8: Uint8Array): CommandLogEntry {
        const commandName: number|undefined = u8.at(0);

        if (commandName === undefined || !(commandName in COMMAND_CLASS)) {
            throw new Error(`Invalid commandName: ${commandName}`);
        }
        else {
            return new COMMAND_CLASS[commandName]({
                commandNameU8: new Uint8Array(u8.buffer, 0, 1),
                commandValueU8: new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1)
            })
        }
    }
}