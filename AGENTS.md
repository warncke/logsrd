# opencode Agent Instructions — @opensassi/opencode

This project uses the **@opensassi/opencode** skill pack.
All skills, scripts, and tooling are delivered via the npm package.

## Available Skills

| `skill` | Use case |
|---------|----------|
| `asm-optimizer` | SIMD/assembly optimization framework |
| `daily-evaluation` | Aggregate session evaluations into dashboards |
| `demo-video` | Produce narrated demo videos with multi-language subtitles |
| `git` | Rebase-based single-commit-per-session workflow |
| `issue` | GitHub issue management |
| `npm-optimizer` | Port an npm package to a C++ native addon |
| `opensassi` | Bootstrap a new project environment |
| `profiler` | Linux perf profiling + flamegraphs |
| `session-evaluation` | Generate structured session reports |
| `skill-manager` | Create/revise skills interactively |
| `system-design` | Interactive C++ spec authoring with diagrams |
| `system-design-review` | Seven-expert panel audit of technical specs |
| `todo` | Create issues + debugging skills from session context |

## Workflow

1. `skill opensassi` — Load the bootstrap skill. It exposes the full skills-index as a reference table.
2. Run `npx @opensassi/opencode <skill-name>` to load any sub-skill. The agent reads the output as the skill's full instructions.
3. Use the skill's commands. Scripts are run via `npx @opensassi/opencode run <path>` or `npx @opensassi/opencode run --skill <name> <path>`.

## Design Constraints

- No commits during development — all changes staged at finish-session time
- Single atomic commit per session
- Full test suite after every rebase
- Session evaluation is read-only (generate) / write-once (export)
- All skills, scripts, and AGENTS.md live in the npm package, not in the project
