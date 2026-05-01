import type { Config } from "jest"

const config: Config = {
    preset: "ts-jest",
    testEnvironment: "node",
    transform: {
        "^.+\\.ts$": [
            "ts-jest",
            {
                tsconfig: "tsconfig.test.json",
                diagnostics: {
                    ignoreCodes: [151002],
                },
            },
        ],
    },
    moduleNameMapper: {
        "^(\\.{0,2}/.*)\\.js$": "$1",
    },
    collectCoverage: false,
    coverageDirectory: "coverage",
    coverageReporters: ["json-summary", "text-summary"],
    coverageThreshold: {
        global: {
            branches: 42,
            functions: 63,
            lines: 53,
            statements: 52,
        },
    },
    testMatch: ["**/src/**/*.test.ts"],
}

export default config
