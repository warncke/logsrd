import CommandTypeJSON, { CommandTypeJSONArgs } from "./command-type-json"

export default class CommandCreateLog extends CommandTypeJSON {
    constructor(args: CommandTypeJSONArgs) {
        super(args)
    }
}