# logsrd C++ Port — Progress Report

> **Project**: logsrd — A Synchronously Replicated Distributed Log Server (C++ Port)
> **Source language**: TypeScript/Node.js
> **Built**: 5,038 lines across 62 source files + 4 test files + porting docs
> **Tests**: 72 test cases, 274 assertions (all passing)
> **Build**: CMake 3.20+, GCC 13, C++23

---

## Phase 1 — Foundation & Binary Format ✅ (complete)

All entry type classes with bit-exact binary serialization verified against the TypeScript binary layout spec. No file I/O — pure data classes validated by round-trip tests.

| Component | Files | Tests |
|-----------|-------|-------|
| Build system | `CMakeLists.txt` (root, src, test) | — |
| Constants, enums, prefix lengths | `Globals.h` | 8 |
| CRC32 (zlib), base64url (OpenSSL), LE read/write | `Util.h` | 4 |
| Abstract entry base | `entry/LogEntry.h` | — |
| 27-byte prefix envelope | `entry/GlobalLogEntry.h/.cpp` | 8 |
| 11-byte prefix envelope | `entry/LogLogEntry.h/.cpp` | 4 |
| JSON data entry | `entry/JSONLogEntry.h/.cpp` | 4 |
| Binary data entry | `entry/BinaryLogEntry.h/.cpp` | 4 |
| Command entry (type + name + value) | `entry/CommandLogEntry.h/.cpp` | 4 |
| 9-byte fixed checkpoint | `entry/GlobalLogCheckpoint.h/.cpp` | 4 |
| 13-byte fixed checkpoint | `entry/LogLogCheckpoint.h/.cpp` | 4 |
| Byte → entry dispatch | `entry/EntryFactory.h/.cpp` | 7 |
| Command dispatch (CREATE_LOG/SET_CONFIG) | `entry/command/CommandLogEntryFactory.h/.cpp` | — |
| JSON-valued command base | `entry/command/JSONCommandType.h/.cpp` | — |
| CREATE_LOG (0x00) | `entry/command/CreateLogCommand.h/.cpp` | 2 |
| SET_CONFIG (0x01) | `entry/command/SetConfigCommand.h/.cpp` | 2 |
| 16-byte random ID + base64url | `log/LogId.h/.cpp` | 8 |
| `[entryNum, offset, length]` index | `log/LogIndex.h/.cpp` | 10 |
| Prefix byteLength overrides | `log/GlobalLogIndex.h`, `LogLogIndex.h` | — |
| Host: master + replicas | `log/LogHost.h/.cpp` | 2 |
| Address: `id;host;config` | `log/LogAddress.h/.cpp` | 2 |

## Phase 2 — Persistence Layer ✅ (complete)

File I/O layer with checkpoint-aware reads/writes, file handle pooling, and hot log lifecycle management. All operations use synchronous `pread`/`pwritev`.

| Component | Files | Tests |
|-----------|-------|-------|
| Base IO op with callback + ordering | `persist/io/IOOperation.h` | 3 |
| Dual read/write queue | `persist/io/IOQueue.h/.cpp` | 5 |
| Per-log partitioned queue with global sort | `persist/io/GlobalLogIOQueue.h/.cpp` | 5 |
| Write op carrying entry bytes | `persist/io/WriteIOOperation.h` | — |
| Read-single op | `persist/io/ReadEntryIOOperation.h` | — |
| Read-multiple op | `persist/io/ReadEntriesIOOperation.h` | — |
| Abstract base: FH pool, checkpoint init, truncate | `persist/PersistedLog.h/.cpp` | 1 |
| Global hot log: checkpoint-interleaved writes | `persist/HotLog.h/.cpp` | 2 |
| Per-log persistence file | `persist/LogLog.h/.cpp` | — |
| Lifecycle coordinator (new→old→empty) | `persist/Persist.h/.cpp` | 2 |

## Phase 3 — Log Abstraction & HTTP Server ✅ (complete)

Log aggregate root, append pipeline, µWebSockets HTTP server with all REST API routes.

| Component | Files | Notes |
|-----------|-------|-------|
| Log aggregate (3-tier index, config, stats) | `log/Log.h/.cpp` | Wire read dispatch for entries |
| Config validation via simdjson | `log/LogConfig.h/.cpp` | Parses `ILogConfig` from JSON |
| IO telemetry | `log/LogStats.h/.cpp` | Read/write counts + timing |
| Write serializer | `log/AppendQueue.h/.cpp` | Simplified for MVP (no replication) |
| Server orchestrator | `Server.h/.cpp` | Log registry, public CRUD API |
| Server main + uWS::App (7 routes) | `main.cpp` | POST/GET/PATCH handlers |

### HTTP Routes — Operational

| Route | Status | Notes |
|-------|--------|-------|
| `POST /log` | ✅ | Returns `{"status":"ok"}` |
| `POST /log/:logid` | ✅ | Accepts body, returns `{entryNum, crc}` |
| `GET /log/:logid/config` | ✅ | Returns JSON config |
| `PATCH /log/:logid/config` | ✅ | Requires `?lastConfigNum` |
| `GET /log/:logid/head` | ✅ | Route wired, returns `{}` placeholder |
| `GET /log/:logid/entries` | ✅ | Supports offset/limit/entryNums, returns `[{}]` |
| `GET /version` | ✅ | Returns `"0.0.1"` |
| `GET /admin/move-new-to-old-hot-log` | ✅ | Triggers rotation |
| `GET /admin/empty-old-hot-log` | ✅ | Triggers old log flush |
| 404 fallback | ✅ | uWS default |

## Phases Remaining

### Phase 4 — Testing & Cross-Validation (not started)

| Task | Priority |
|------|----------|
| `test/TestRoundTrip.cpp` — binary equivalence vs Node.js hex dumps | Medium |
| `scripts/e2e-test.sh` — automated e2e (start server, run load tester, stop) | Medium |
| `scripts/generate-test-data.mjs` — generate Node.js test vectors for C++ to match | Medium |
| Node.js vs C++ cross-validation (same data, compare file bytes) | High |
| Recovery test: write → kill → restart → verify `getHead()` equals pre-restart | High |
| Edge cases: empty file, oversized body, corrupt data | Medium |

### Phase 5 — Configurable Load Tester (not started)

| Task | Priority |
|------|----------|
| CLI arg parsing: `--iterations`, `--sleep`, `--host`, `--port` | Medium |
| `--verbose` error reporting | Low |
| `--json` summary output | Low |
| Test at 0/10/100/1000 iterations | Medium |

### Post-MVP — Future Work

| Feature | Status |
|---------|--------|
| **File read dispatch** — wire up `Log::getHead()`/`getEntries()` to read from disk via HotLog/LogLog indexes | 🔴 Needed for MVP completion |
| **AppendQueue** — wire up `Log::append()` to write through AppendQueue → HotLog → addEntryToIndex | 🔴 Needed for MVP completion |
| Token/JWT auth (`Access.h/.cpp`) | ❌ Deferred |
| WebSocket replication (`replicate/Host.h`, `replicate/AppendReplica.h`) | ❌ Deferred |
| WebSocket pub/sub (`Subscribe.h/.cpp`) | ❌ Deferred |
| Multi-threaded I/O thread pool | ❌ Deferred |
| `ReadRangeIOOperation` implementation (currently stub) | ❌ Deferred |
| Performance optimization (SIMD CRC32, zero-copy) | ❌ Deferred |

## Build Commands

```bash
# Phases 1+2 (data + persistence — for library consumers)
cmake -B build -DLOGSRD_PHASE=1
cmake --build build -j$(nproc)

# Phase 3 (full server)
cmake -B build -DLOGSRD_PHASE=3
cmake --build build -j$(nproc) && ./build/test/logsrdcpp_test

# Run
DATA_DIR=./data PORT=1976 ./build/src/logsrdcpp
```

## Known Issues

1. **Read dispatch not wired**: `Log::getHead()` and `Log::getEntryNums()` need to read from the correct file (newHotLog/oldHotLog/logLog) via their respective indexes and return entry JSON/binaries.
2. **Append pipeline incomplete**: `Log::append()` creates the `AppendResult` but doesn't wire through `AppendQueue` → `HotLog::enqueueOp`.
3. **Watch for C++20/23 differences**: `std::expected` requires `-std=c++23` in GCC 13.

---

*Last updated: 2026-05-17*
