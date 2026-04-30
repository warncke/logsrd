# Testing Addition Script — LogsR

This script adds a complete Jest‑based testing environment to the existing LogsR project **without modifying a single line of the project’s source code**.  
All new files are placed alongside the existing source tree and only new test files are created.

---

## 0. Non‑negotiable constraint

**NO EXISTING PROJECT SOURCE FILE SHALL BE MODIFIED.**  
The following additions are strictly additive. Any change to an existing file (including `package.json`, `tsconfig.json`, or any source file) would violate this rule. If an adaptation is necessary, it must be achieved through additional configuration files that coexist with the originals without overwriting them.

---

## 1. Required devDependencies

Run these commands in the project root. They will install the packages needed for testing and add them to `devDependencies` with exact versions (no `^` or `~`).

```
npm install --save-dev --save-exact jest@latest ts-jest@latest @types/jest@latest @types/node@latest
```

If the project does not yet have a `package.json`, create one with `npm init -y` first, but ensure it does not interfere with existing npm scripts.

---

## 2. New configuration files

All files are created in the **project root**. Their content must be exactly as shown.

### 2.1 `jest.config.ts`

```typescript
import type { Config } from "jest"

const config: Config = {
    preset: "ts-jest/presets/default-esm",
    testEnvironment: "node",
    transform: {
        "^.+\\.ts$": ["ts-jest", { useESM: true, tsconfig: "tsconfig.test.json" }],
    },
    extensionsToTreatAsEsm: [".ts"],
    moduleNameMapper: {
        // Allow the existing project imports (which currently omit ".js") to resolve correctly.
        // The mapper removes ".js" if present, but is harmless when imports lack an extension.
        "^(\\.{0,2}/.*)\\.js$": "$1",
        "^(\\.{0,2}/.*)$": "$1",
    },
    collectCoverage: false, // enabled only via the "coverage" script
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
```

### 2.2 `tsconfig.test.json`

This TypeScript configuration is **only** used by Jest (`ts-jest`). It coexists with the project’s main `tsconfig.json` and does not alter it.

```json
{
    "compilerOptions": {
        "target": "ES2022",
        "module": "NodeNext",
        "moduleResolution": "NodeNext",
        "strict": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "forceConsistentCasingInFileNames": true,
        "outDir": "./test-dist",
        "rootDir": ".",
        "sourceMap": true
    },
    "include": ["src/**/*.ts"]
}
```

**Note:** `outDir` is set to `./test-dist` to avoid polluting the production `lib/` directory; the compiled tests are never actually written to disk because `ts-jest` transpiles in memory, but the setting satisfies TypeScript’s requirement.

### 2.3 `.gitignore` additions

If the project already has a `.gitignore`, append the following lines. If it does not exist, create the file with these contents (plus the existing entries the project may already ignore; do not overwrite an existing `.gitignore`).

```
# Testing artifacts
coverage/
test-dist/
```

---

## 3. New npm scripts

Add the following scripts to the `"scripts"` section of `package.json`.  
**If a script with the same name already exists, prefix the new script with `test:custom:` or consult the project maintainer before merging.** For example, if `"test"` already exists, create a separate script `"test:units"` that uses Jest.

The recommended minimal addition:

```json
"scripts": {
  "test": "jest",
  "coverage": "jest --coverage"
}
```

If `"test"` and `"coverage"` are already taken, use:

```json
"scripts": {
  "test:jest": "jest",
  "coverage:jest": "jest --coverage"
}
```

---

## 4. Test file template

Every source module that exports testable units must eventually be covered. To illustrate the required structure, create the first test file for the `LogId` class (co‑located with the source).

### 4.1 `src/log/log-id.test.ts`

```typescript
import { describe, expect, it } from "@jest/globals"

import LogId from "./log-id.js"

describe("LogId", () => {
    it("should create a random LogId of length 16", async () => {
        const id = await LogId.newRandom()
        expect(id.byteLength()).toBe(16)
    })

    it("should round‑trip base64 encoding", async () => {
        const id = await LogId.newRandom()
        const b64 = id.base64()
        const decoded = LogId.newFromBase64(b64)
        expect(decoded.base64()).toBe(b64)
    })

    it("should derive a correct log‑dir prefix", async () => {
        const id = await LogId.newRandom()
        const prefix = id.logDirPrefix()
        expect(prefix).toMatch(/^[0-9a-f]{2}\/[0-9a-f]{2}$/)
    })
})
```

All subsequent tests must follow the same pattern: co‑located with the source, importing the module using relative paths with `.js` extensions (as per ESM and the `jest.config.ts` mapper).

---

## 5. Execution order

1. Install the dependencies with `npm install`.
2. Run `npm test` (or the appropriate Jest script) to execute the initial test.
3. Once the test suite passes, run `npm run coverage` (or `npm run coverage:jest`) to collect coverage.  
   The output will indicate the percentage and list uncovered lines.
4. Add more test files for every exportable unit (following the naming rule `*.test.ts`) until the **coverage threshold of 90%** is met and all tests pass.

**Remember:** the threshold is non‑negotiable. Never lower the values in `jest.config.ts`. If coverage is insufficient, add more focused tests—never alter the specification’s required behaviour.

---

## 6. Additional tools (optional)

If the project does not yet have linting or formatting setup, the following files can be added (they are not strictly required for testing but recommended). They are **optional** and must not modify any existing source code.

- `.prettierrc` and `.prettierignore`
- `eslint.config.js`
- `.vscode/settings.json` (to use the workspace TypeScript version)

These are the same as described in the generic instantiation guide; adapt them only if the project maintainer agrees.

---

**This script establishes the testing infrastructure. Now you can systematically write unit tests for every component of the specification, discover edge cases, and feed the findings back into the specification refinement loop.**
