import Ajv, { ErrorObject, JSONSchemaType } from "ajv"
import crypto from "mz/crypto"

export interface ILogConfig {
    logId: string
    type: string
    master: string
    replicas?: string[]
    asyncReplicas?: string[]
    access: string
    authType: string
    accessToken?: string
    adminToken?: string
    readToken?: string
    writeToken?: string
    readWriteToken?: string
    jwtSecret?: string
    accessJWTSecret?: string
    adminJWTSecret?: string
    readJWTSecret?: string
    writeJWTSecret?: string
    readWriteJWTSecret?: string
    stopped: boolean
}

export const LogConfigSchema: JSONSchemaType<ILogConfig> = {
    type: "object",
    properties: {
        logId: {
            type: "string",
            default: "",
        },
        type: {
            type: "string",
            enum: ["binary", "json"],
            default: "json",
        },
        master: {
            type: "string",
            default: "",
        },
        replicas: {
            type: "array",
            items: {
                type: "string",
            },
            nullable: true,
        },
        asyncReplicas: {
            type: "array",
            items: {
                type: "string",
            },
            nullable: true,
        },
        access: {
            type: "string",
            enum: ["public", "private", "readOnly", "writeOnly"],
            default: "private",
        },
        authType: {
            type: "string",
            enum: ["token", "jwt"],
            default: "token",
        },
        accessToken: {
            type: "string",
            nullable: true,
        },
        adminToken: {
            type: "string",
            nullable: true,
        },
        readToken: {
            type: "string",
            nullable: true,
        },
        writeToken: {
            type: "string",
            nullable: true,
        },
        readWriteToken: {
            type: "string",
            nullable: true,
        },
        jwtSecret: {
            type: "string",
            nullable: true,
        },
        accessJWTSecret: {
            type: "string",
            nullable: true,
        },
        adminJWTSecret: {
            type: "string",
            nullable: true,
        },
        readJWTSecret: {
            type: "string",
            nullable: true,
        },
        writeJWTSecret: {
            type: "string",
            nullable: true,
        },
        readWriteJWTSecret: {
            type: "string",
            nullable: true,
        },
        stopped: {
            type: "boolean",
            default: false,
        },
    },
    required: ["access", "authType", "logId", "master", "type", "stopped"],
    additionalProperties: false,
}

class InvalidLogConfigError extends Error {
    errors: ErrorObject<string, Record<string, any>, unknown>[]

    constructor(message: string, errors: ErrorObject<string, Record<string, any>, unknown>[]) {
        super(message)
        this.errors = errors
    }
}

const ajv = new Ajv({ useDefaults: true })
const schemaValidator = ajv.compile(LogConfigSchema)

export default class LogConfig implements ILogConfig {
    // @ts-ignore
    logId: string
    // @ts-ignore
    type: string
    // @ts-ignore
    master: string
    replicas?: string[]
    asyncReplicas?: string[]
    // @ts-ignore
    access: string
    // @ts-ignore
    authType: string
    accessToken?: string
    adminToken?: string
    readToken?: string
    writeToken?: string
    readWriteToken?: string
    jwtSecret?: string
    accessJWTSecret?: string
    adminJWTSecret?: string
    readJWTSecret?: string
    writeJWTSecret?: string
    readWriteJWTSecret?: string
    // @ts-ignore
    stopped: boolean

    constructor(config: ILogConfig) {
        Object.assign(this, config)
    }

    async setDefaults() {
        if (this.authType === "token") {
            // if authType is token then no jwtSecrets should be provided
            if (
                this.jwtSecret ||
                this.accessJWTSecret ||
                this.adminJWTSecret ||
                this.readJWTSecret ||
                this.writeJWTSecret ||
                this.readWriteJWTSecret
            ) {
                throw new Error("jwtSecrets should not be provided when authType is token")
            }
            // unless all of the access token varients are specified need a base accessToken
            if (
                !this.accessToken &&
                (!this.adminToken || !this.readToken || !this.writeToken || !this.readWriteToken)
            ) {
                this.accessToken = Buffer.from(await crypto.randomBytes(32)).toString("base64")
            }
        } else if (this.authType === "jwt") {
            // if authType is jwt then no accessTokens should be provided
            if (this.accessToken || this.adminToken || this.readToken || this.writeToken || this.readWriteToken) {
                throw new Error("accessTokens should not be provided when authType is jwt")
            }
            // unless all of the jwt varients are specified need a base jwtSecret
            if (
                !this.jwtSecret &&
                (!this.accessJWTSecret ||
                    !this.adminJWTSecret ||
                    !this.readJWTSecret ||
                    !this.writeJWTSecret ||
                    !this.readWriteJWTSecret)
            ) {
                this.jwtSecret = Buffer.from(await crypto.randomBytes(32)).toString("base64")
            }
        } else {
            throw new Error("Invalid authType")
        }
    }

    static async newFromJSON(json: any): Promise<LogConfig> {
        if (schemaValidator(json)) {
            const config = new LogConfig(json)
            await config.setDefaults()
            return config
        } else {
            throw new InvalidLogConfigError("Invalid log config", schemaValidator.errors!)
        }
    }
}
