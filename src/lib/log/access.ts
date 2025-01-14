import * as jose from "jose"

import Log from "../log"

export type AccessAllowed = {
    admin: boolean
    read: boolean
    write: boolean
}

export default class Access {
    log: Log
    #jwtSecretU8: Uint8Array | null = null

    constructor(log: Log) {
        this.log = log
    }

    accessAllowed(admin: boolean, read: boolean, write: boolean): AccessAllowed {
        return { admin, read, write }
    }

    async allowed(token: string | null): Promise<AccessAllowed> {
        const config = await this.log.getConfig()
        if (config.authType === "token") {
            // if there was no token then only allow public access
            if (token === null || token.length === 0) {
                return this.accessAllowed(
                    false,
                    config.access === "public" || config.access === "readOnly",
                    config.access === "public" || config.access === "writeOnly",
                )
            }
            // superToken gives access to everything
            if (config.superToken && config.superToken === token) {
                return this.accessAllowed(true, true, true)
            }
            // if an accessToken is provided then it gives access to anything public or without token
            if (config.accessToken && config.accessToken === token) {
                return this.accessAllowed(
                    !config.adminToken && !config.superToken,
                    config.access === "public" || config.access === "readOnly" || !config.readToken,
                    config.access === "public" || config.access === "writeOnly" || !config.writeToken,
                )
            }
            // if adminToken is provided then allow admin access any anything public
            if (config.adminToken && config.adminToken === token) {
                return this.accessAllowed(
                    true,
                    config.access === "public" || config.access === "readOnly",
                    config.access === "public" || config.access === "writeOnly",
                )
            }
            // if readToken is provided then allow read and write if write is public
            // setting readToken is not allowed for public or readOnly log
            if (config.readToken && config.readToken === token) {
                return this.accessAllowed(false, true, config.access === "writeOnly")
            }
            // if writeToken is provided then allow write and read if read is public
            // setting writeToken is not allowed for public or writeOnly log
            if (config.writeToken && config.writeToken === token) {
                return this.accessAllowed(false, config.access === "readOnly", true)
            }
            // if there was no token match then only allow public access
            return this.accessAllowed(
                false,
                config.access === "public" || config.access === "readOnly",
                config.access === "public" || config.access === "writeOnly",
            )
        } else if (config.authType === "jwt") {
            if (token === null) {
                return this.accessAllowed(false, false, false)
            }
            const { payload } = await jose.jwtVerify(token, this.jwtSecretU8(), { algorithms: ["HS256"] })
            if (typeof payload.allow !== "string") {
                throw new Error("Invalid JWT: allow required")
            }
            return this.accessAllowed(
                payload.allow.includes("admin"),
                payload.allow.includes("read"),
                payload.allow.includes("write"),
            )
        } else {
            throw new Error("Invalid config: invalid authType")
        }
    }

    async allowAdmin(token: string | null): Promise<boolean> {
        const allowed = await this.allowed(token)
        return allowed.admin
    }

    async allowRead(token: string | null): Promise<boolean> {
        const allowed = await this.allowed(token)
        return allowed.read
    }

    async allowWrite(token: string | null): Promise<boolean> {
        const allowed = await this.allowed(token)
        return allowed.write
    }

    jwtSecretU8(): Uint8Array {
        if (this.#jwtSecretU8 === null) {
            if (!this.log.config!.jwtSecret) {
                throw new Error("Invalid config: No jwtSecret")
            }
            this.#jwtSecretU8 = Buffer.from(this.log.config!.jwtSecret, "base64")
        }
        return this.#jwtSecretU8
    }
}
