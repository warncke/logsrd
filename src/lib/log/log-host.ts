export default class LogHost {
    master: string
    replicas: string[]

    constructor(master: string, replicas: string[] = []) {
        this.master = master
        this.replicas = replicas
    }

    static fromString(host: string): LogHost {
        const [master, ...replicas] = host.split(",")
        return new LogHost(master, replicas)
    }

    toString(): string {
        return [this.master, ...this.replicas].join(",")
    }
}
