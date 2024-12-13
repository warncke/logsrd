import { CommandName } from "../../types";
import U32CommandType, { U32CommandTypeArgs } from "./command-type/u32-command-type";

const COMMAND_NAME_BYTE = new Uint8Array([CommandName.ABORT_WRITE])

export default class AbortWriteCommand extends U32CommandType {
    constructor(args: U32CommandTypeArgs) {
        if (!args.commandNameU8) {
            args.commandNameU8 = COMMAND_NAME_BYTE
        }
        super(args)
    }
}