import { CommandName } from "../../globals"
import JSONCommandType, { JSONCommandTypeArgs } from "./command-type/json-command-type"

const COMMAND_NAME_BYTE = new Uint8Array([CommandName.SET_CONFIG])

export default class SetConfigCommand extends JSONCommandType {
    constructor(args: JSONCommandTypeArgs) {
        if (!args.commandNameU8) {
            args.commandNameU8 = COMMAND_NAME_BYTE
        }
        super(args)
    }
}
