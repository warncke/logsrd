import CommandTypeJSON, { CommandTypeJSONArgs } from "./command-type-json"

export default class CommandSetConfig extends CommandTypeJSON {
    constructor(args: CommandTypeJSONArgs) {
        super(args)
    }
}