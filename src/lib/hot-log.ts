import fs, { FileHandle } from 'node:fs/promises'

export default class HotLog {
    active: Map<string, Array<number>> = new Map()
    fh: FileHandle|null = null 
    logFile: string
    length: number = 0

    constructor({ logFile }: { logFile: string }) {
        this.logFile = logFile
    }

    async init(): Promise<void> {
        const stat = await fs.stat(this.logFile)
    }
}