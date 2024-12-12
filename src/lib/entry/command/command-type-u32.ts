import CommandLogEntry from "../command-log-entry"

export type CommandTypeU32Args = {
    commandNameU8?: Uint8Array,
    commandU8?: Uint8Array,
    command?: number,
}
export default class CommandTypeU32 extends CommandLogEntry {
    constructor(args: CommandTypeU32Args) {
        if (args.commandNameU8 && args.commandU8) {
            super({ commandNameU8: args.commandNameU8, commandU8: args.commandU8 })
        }
        else if (args.commandNameU8 && args.command !== undefined) {
            super({
                commandNameU8: args.commandNameU8,
                commandU8: new Uint8Array(new Uint32Array([args.command]).buffer) 
            })
        }
        else {
            throw new Error("CommandTypeU32 requires commandNameU8 and either commandU8 or command")
        }
    }
}