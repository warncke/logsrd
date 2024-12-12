import CommandLogEntry from "../command-log-entry"
export type CommandTypeStringArgs = {
    commandNameU8?: Uint8Array,
    commandU8?: Uint8Array,
    command?: string,
}
export default class CommandTypeString extends CommandLogEntry {
    constructor(args: CommandTypeStringArgs) {
        if (args.commandNameU8 && args.commandU8) {
            super({ commandNameU8: args.commandNameU8, commandU8: args.commandU8 })
        }
        else if (args.commandNameU8 && args.command !== undefined) {
            super({
                commandNameU8: args.commandNameU8,
                commandU8: new TextEncoder().encode(args.command),
            })
        }
        else {
            throw new Error("CommandTypeString requires commandNameU8 and either commandU8 or command")
        }
    }
}