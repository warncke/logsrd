import CommandLogEntry from "../../command-log-entry"

export type StringCommandTypeArgs = {
    commandNameU8?: Uint8Array,
    commandValueU8?: Uint8Array,
    value?: string,
}

export default class StringCommandType extends CommandLogEntry {
    constructor(args: StringCommandTypeArgs) {
        if (args.commandNameU8 && args.commandValueU8) {
            super({ commandNameU8: args.commandNameU8, commandValueU8: args.commandValueU8 })
        }
        else if (args.commandNameU8 && args.value !== undefined) {
            super({
                commandNameU8: args.commandNameU8,
                commandValueU8: new TextEncoder().encode(args.value),
            })
        }
        else {
            throw new Error("StringCommandType requires commandNameU8 and either commandValueU8 or value")
        }
    }

    value(): string {
        return new TextDecoder().decode(this.commandValueU8)
    }
}