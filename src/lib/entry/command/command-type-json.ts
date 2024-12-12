import CommandLogEntry from "../command-log-entry"

export type CommandTypeJSONArgs = {
    commandNameU8?: Uint8Array,
    commandU8?: Uint8Array,
    command?: string|any,
}

export default class CommandTypeJSON extends CommandLogEntry {
    constructor(args: CommandTypeJSONArgs) {
        if (args.commandNameU8 && args.commandU8) {
            super({ commandNameU8: args.commandNameU8, commandU8: args.commandU8 })
        }
        else if (args.commandNameU8 && args.command !== undefined) {
            if (typeof args.command !== "string") {
                args.command = JSON.stringify(args.command)
            }
            super({
                commandNameU8: args.commandNameU8,
                commandU8: new TextEncoder().encode(args.command),
            })
        }
        else {
            throw new Error("CommandTypeJSON requires commandNameU8 and either commandU8 or command")
        }
    }
}