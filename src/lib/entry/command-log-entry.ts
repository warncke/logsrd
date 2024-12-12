import LogEntry, { EntryType } from "../log-entry";

const TYPE_BYTE = new Uint8Array([EntryType.COMMAND])

export enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_WRITE,
    END_WRITE,
}

const COMMAND_BYTE = {
    [CommandName.CREATE_LOG]: new Uint8Array([CommandName.CREATE_LOG]),
    [CommandName.SET_CONFIG]: new Uint8Array([CommandName.SET_CONFIG]),
    [CommandName.BEGIN_WRITE]: new Uint8Array([CommandName.BEGIN_WRITE]),
    [CommandName.END_WRITE]: new Uint8Array([CommandName.END_WRITE]),
}

export default class CommandLogEntry extends LogEntry {
    commandName: CommandName
    command: string

    constructor(commandName: CommandName, command: string) {
        super()
        this.commandName = commandName
        this.command = command
    }

    static fromU8(u8: Uint8Array): CommandLogEntry {
        const commandName: number|undefined = u8.at(0);

        if (commandName === undefined || !(commandName in CommandName)) {
            throw new Error(`Invalid commandName: ${commandName}`);
        }

        return new CommandLogEntry(
            commandName,
            new TextDecoder().decode( new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1) )
        )
    }
}