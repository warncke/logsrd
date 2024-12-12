import CommandLogEntry from "../../command-log-entry"

export type JSONCommandTypeArgs = {
    commandNameU8?: Uint8Array,
    commandValueU8?: Uint8Array,
    value?: any,
}

export default class JSONCommandType extends CommandLogEntry {
    constructor(args: JSONCommandTypeArgs) {
        if (args.commandNameU8 && args.commandValueU8) {
            super({ commandNameU8: args.commandNameU8, commandValueU8: args.commandValueU8 })
        }
        else if (args.commandNameU8 && args.value !== undefined) {
            if (typeof args.value !== "string") {
                args.value = JSON.stringify(args.value)
            }
            super({
                commandNameU8: args.commandNameU8,
                commandValueU8: new TextEncoder().encode(args.value),
            })
        }
        else {
            throw new Error("JSONCommandType requires commandNameU8 and either commandValueU8 or value")
        }
    }

    value(): any {
        const text = new TextDecoder().decode(this.commandValueU8)
        return JSON.parse(text)
    }
}