import { CommandName } from "../command-log-entry";
import CommandTypeU32, { CommandTypeU32Args } from "./command-type-u32";

const COMMAND_NAME_BYTE = new Uint8Array([CommandName.END_WRITE])

export default class CommandEndWrite extends CommandTypeU32 {
    constructor(args: CommandTypeU32Args) {
        if (!args.commandNameU8) {
            args.commandNameU8
        }
        super(args)
    }
}