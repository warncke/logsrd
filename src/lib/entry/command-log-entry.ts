import LogEntry, { EntryType } from "../log-entry";
import CommandCreateLog from "./command/command-create-log";
import CommandEndWrite from "./command/command-end-write";
import CommandSetConfig from "./command/command-set-config";
import CommandBeginWrite from "./command/commgand-begin-write";

const TYPE_BYTE = new Uint8Array([EntryType.COMMAND])

export enum CommandName {
    CREATE_LOG,
    SET_CONFIG,
    BEGIN_WRITE,
    END_WRITE,
}

type COMMAND_CLASSES =
    typeof CommandCreateLog     |
    typeof CommandSetConfig     |
    typeof CommandBeginWrite    |
    typeof CommandEndWrite

const COMMAND_CLASS: { [index: number]: COMMAND_CLASSES} = {
    [CommandName.CREATE_LOG]: CommandCreateLog,
    [CommandName.SET_CONFIG]: CommandSetConfig,
    [CommandName.BEGIN_WRITE]: CommandBeginWrite,
    [CommandName.END_WRITE]: CommandEndWrite,
}

export default class CommandLogEntry extends LogEntry {
    #commandNameU8: Uint8Array
    #commandU8: Uint8Array

    constructor({
        commandNameU8,
        commandU8,
    }: {
        commandNameU8: Uint8Array,
        commandU8: Uint8Array
    }) {
        super()
        this.#commandNameU8 = commandNameU8
        this.#commandU8 = commandU8
    }

    byteLength(): number {
        // entry length is: 1 byte entry type + 1 byte command name + command.length
        return 2 + this.#commandU8.byteLength
    }

    u8s(): Uint8Array[] {
        return [ TYPE_BYTE,this.#commandNameU8, this.#commandU8 ]
    }

    static fromU8(u8: Uint8Array): CommandLogEntry {
        const commandName: number|undefined = u8.at(0);

        if (commandName === undefined || !(commandName in COMMAND_CLASS)) {
            throw new Error(`Invalid commandName: ${commandName}`);
        }
        else {
            return new COMMAND_CLASS[commandName]({
                commandNameU8: new Uint8Array(u8.buffer, 0, 1),
                commandU8: new Uint8Array(u8.buffer, u8.byteOffset + 1, u8.byteLength - 1)
            })
        }
    }
}