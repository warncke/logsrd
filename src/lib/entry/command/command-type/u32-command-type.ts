import CommandLogEntry from "../../command-log-entry"

export type U32CommandTypeArgs = {
    commandNameU8?: Uint8Array,
    commandValueU8?: Uint8Array,
    value?: number,
}

export default class U32CommandType extends CommandLogEntry {
    constructor(args: U32CommandTypeArgs) {
        if (args.commandNameU8 && args.commandValueU8) {
            super({ commandNameU8: args.commandNameU8, commandValueU8: args.commandValueU8 })
        }
        else if (args.commandNameU8 && args.value !== undefined) {
            super({
                commandNameU8: args.commandNameU8,
                commandValueU8: new Uint8Array(new Uint32Array([args.value]).buffer)
            })
        }
        else {
            throw new Error("U32CommandType requires commandNameU8 and either commandValueU8 or value")
        }
    }

    value(): number {
        return new Uint32Array(this.commandValueU8.buffer)[0]
    }

    setValue(value: number): void {
        this.commandValueU8 = new Uint8Array(new Uint32Array([value]).buffer)
    }
}