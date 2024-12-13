import { CommandName, EntryType } from "../../types";
import U32CommandType, { U32CommandTypeArgs } from "./command-type/u32-command-type";

const COMMAND_NAME_BYTE = new Uint8Array([CommandName.BEGIN_WRITE])

export default class BeginWriteCommand extends U32CommandType {
    constructor(args: U32CommandTypeArgs) {
        if (!args.commandNameU8) {
            args.commandNameU8 = COMMAND_NAME_BYTE
        }
        super(args)
    }

    static fromU8(u8: Uint8Array): BeginWriteCommand {
        const entryType = u8.at(0)
        if (entryType !== EntryType.COMMAND) {
            throw new Error(`Invalid entryType: ${entryType}`)
        }
        const commandName = u8.at(1)
        if (commandName !== CommandName.BEGIN_WRITE) {
            throw new Error(`Invalid commandName: ${commandName}`)
        }
        return new BeginWriteCommand({
            commandNameU8: new Uint8Array(u8.buffer, 1, 1),
            commandValueU8: new Uint8Array(u8.buffer, 2, 4)
        })
    }
}