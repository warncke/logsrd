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
            branches: 90,
            functions: 90,
            lines: 90,
            statements: 90,
        },
    },
    testMatch: ["**/src/**/*.test.ts"],
}

export default config
