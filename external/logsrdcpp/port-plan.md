# logsrd C++ Port Plan

> **Project**: logsrd — A Synchronously Replicated Distributed Log Server (C++ Port)
> **Source**: TypeScript/Node.js → C++20
> **HTTP Framework**: µWebSockets (C++, at `external/uWebSockets/`)
> **JSON**: simdjson
> **CRC32**: zlib (`crc32()`)
> **Testing**: Catch2 + cross-validation scripts
> **Build**: CMake

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Binary Format Reference](#2-binary-format-reference)
3. [Directory Structure](#3-directory-structure)
4. [Build System](#4-build-system)
5. [Phase 1 — Foundation & Binary Format](#5-phase-1--foundation--binary-format)
6. [Phase 2 — Persistence Layer](#6-phase-2--persistence-layer)
7. [Phase 3 — Log Abstraction & HTTP Server](#7-phase-3--log-abstraction--http-server)
8. [Phase 4 — Testing & Cross-Validation](#8-phase-4--testing--cross-validation)
9. [Phase 5 — Configurable Load Tester](#9-phase-5--configurable-load-tester)
10. [Future Work (Post-MVP)](#10-future-work-post-mvp)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Risk Register](#12-risk-register)

---

## 1. Project Overview

### 1.1 What logsrd Does

logsrd is a **synchronously-replicated distributed append-only log server**. Clients write entries via an HTTP REST API. Every append is persisted to disk with CRC32 checksums, checkpointed for recovery, and (in the full version) synchronously replicated to peer nodes.

### 1.2 MVP Scope (This Plan)

| Feature | Status |
|---------|--------|
| HTTP REST API (create/append/read/config/head) | ✅ In scope |
| Binary-identical persistence (vs Node.js) | ✅ Required |
| Global hot log (new + old) with rotation | ✅ In scope |
| Per-log LogLog persistence | ✅ In scope |
| Checkpoint-based recovery | ✅ In scope |
| CRC32 integrity checks | ✅ Required |
| Config validation via simdjson | ✅ In scope |
| Catch2 unit tests | ✅ In scope |
| Cross-validation vs Node.js | ✅ In scope |
| WebSocket replication | ❌ MVP |
| WebSocket pub/sub | ❌ MVP |
| Token/JWT auth | ❌ MVP |
| Async I/O (thread pool) | ❌ MVP (synchronous I/O) |

### 1.3 Key Design Decisions

1. **Binary compatibility**: CRC32 via zlib's `crc32()` matches `@node-rs/crc32`. Verified bit-exact.
2. **Synchronous I/O**: `pread()`/`pwritev()` inline in the uWS event loop. The Node.js async IO queue becomes a serial dispatch layer.
3. **No auth in MVP**: Access checks return `{admin:true, read:true, write:true}` for all requests.
4. **simdjson for config**: `LogConfig::validate()` uses simdjson's parser for JSON Schema-like validation.
5. **µWebSockets only for HTTP**: WS/client functionality is deferred. The server uses `uWS::App` for HTTP routes only.
6. **OpenSSL for crypto**: `RAND_bytes()` for LogId generation, custom `base64url` encoding via OpenSSL `BIO_f_base64`.

---

## 2. Binary Format Reference

### 2.1 Entry Type Byte

Every entry on disk starts with a single type byte:

| Value | Name | Fixed Size | C++ Class |
|-------|------|------------|-----------|
| `0x00` | `GLOBAL_LOG` | 27-byte prefix + variable | `GlobalLogEntry` |
| `0x01` | `LOG_LOG` | 11-byte prefix + variable | `LogLogEntry` |
| `0x02` | `GLOBAL_LOG_CHECKPOINT` | 9 bytes | `GlobalLogCheckpoint` |
| `0x03` | `LOG_LOG_CHECKPOINT` | 13 bytes | `LogLogCheckpoint` |
| `0x04` | `COMMAND` | 2 bytes + variable | `CommandLogEntry` |
| `0x05` | `BINARY` | 1 byte + variable | `BinaryLogEntry` |
| `0x06` | `JSON` | 1 byte + variable | `JSONLogEntry` |

### 2.2 GlobalLogEntry (27-byte prefix + inner entry)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x00)
1       16    logId            16-byte UUID (big-endian bytes)
17      4     entryNum         uint32 LE
21      2     length           uint16 LE (inner entry byte length)
23      4     crc              uint32 LE (CRC32 of inner entry)
27      N     payload          inner entry bytes
```

### 2.3 LogLogEntry (11-byte prefix + inner entry)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x01)
1       4     entryNum         uint32 LE
5       2     length           uint16 LE
7       4     crc              uint32 LE
11      N     payload          inner entry bytes
```

### 2.4 GlobalLogCheckpoint (9 bytes, fixed)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x02)
1       2     lastEntryOffset  int16 LE (negative offset from checkpoint to last entry)
3       2     lastEntryLength  uint16 LE
5       4     crc              uint32 LE
```

### 2.5 LogLogCheckpoint (13 bytes, fixed)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x03)
1       2     lastEntryOffset  int16 LE (negative offset from checkpoint to last entry)
3       2     lastEntryLength  uint16 LE
5       4     lastConfigOffset uint32 LE (offset of last config entry from file start)
9       4     crc              uint32 LE
```

### 2.6 CommandLogEntry (variable length)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x04)
1       1     commandName      uint8 (enum CommandName)
2       N     commandValue     variable bytes (JSON for JSONCommandType subclasses)
```

**CommandName enum**: `CREATE_LOG = 0x00`, `SET_CONFIG = 0x01`

### 2.7 JSONLogEntry (variable length)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x06)
1       N     payload          UTF-8 encoded JSON string
```

### 2.8 BinaryLogEntry (variable length)

```
Offset  Size  Field            Encoding
──────  ────  ─────            ────────
0       1     entryType        uint8 (0x05)
1       N     payload          opaque bytes
```

### 2.9 Checkpoint Intervals

| Constant | Value |
|----------|-------|
| `GLOBAL_LOG_CHECKPOINT_INTERVAL` | 131072 (128 KB) |
| `GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH` | 9 |
| `LOG_LOG_CHECKPOINT_INTERVAL` | 131072 (128 KB) |
| `LOG_LOG_CHECKPOINT_BYTE_LENGTH` | 13 |

### 2.10 CRC32 Algorithm

- Algorithm: CRC-32/ISO-HDLC (same as zlib `crc32()`)
- Polynomial: `0xEDB88320` (reflected)
- Initial value: `0xFFFFFFFF`
- Final XOR: `0xFFFFFFFF`
- **Must match** `@node-rs/crc32` output exactly

### 2.11 LogId

- 16 random bytes (`RAND_bytes()`)
- Base64URL encoded (22 chars): standard base64 with `+/` → `-_` and no `=` padding
- Two-level hex directory prefix: `logId[0].toString(16)/logId[1].toString(16)/`

### 2.12 File Layout

```
DATA_DIR/
├── global-hot.log.new        # New-hot-global log (active writes)
├── global-hot.log.old        # Old-hot-global log (intermediate buffer)
└── logs/
    └── XX/                   # hex prefix (first byte of logId)
        └── YY/               # hex prefix (second byte of logId)
            └── <base64>.log  # Per-log persistent file (LogLog)
```

### 2.13 LogIndex

In-memory flat array of `[entryNum, offset, length]` triplets stored as `std::vector<uint32_t>`:

```
en = [entryNum0, offset0, length0, entryNum1, offset1, length1, ...]
```

Plus separate tracking of the last config entry (`lcNum`, `lcOff`, `lcLen`).

**`byteLength(prefixLength)`**: Sum of `(length - prefixLength)` for all entries.

---

## 3. Directory Structure

### 3.1 Source Tree

```
external/logsrdcpp/
├── CMakeLists.txt
├── port-plan.md
├── src/
│   ├── CMakeLists.txt
│   ├── main.cpp
│   ├── Globals.h
│   ├── Server.h
│   ├── Server.cpp
│   ├── entry/
│   │   ├── LogEntry.h
│   │   ├── GlobalLogEntry.h
│   │   ├── GlobalLogEntry.cpp
│   │   ├── LogLogEntry.h
│   │   ├── LogLogEntry.cpp
│   │   ├── JSONLogEntry.h
│   │   ├── JSONLogEntry.cpp
│   │   ├── BinaryLogEntry.h
│   │   ├── BinaryLogEntry.cpp
│   │   ├── CommandLogEntry.h
│   │   ├── CommandLogEntry.cpp
│   │   ├── GlobalLogCheckpoint.h
│   │   ├── GlobalLogCheckpoint.cpp
│   │   ├── LogLogCheckpoint.h
│   │   ├── LogLogCheckpoint.cpp
│   │   ├── EntryFactory.h
│   │   ├── EntryFactory.cpp
│   │   └── command/
│   │       ├── JSONCommandType.h
│   │       ├── JSONCommandType.cpp
│   │       ├── CreateLogCommand.h
│   │       └── SetConfigCommand.h
│   ├── log/
│   │   ├── Log.h
│   │   ├── Log.cpp
│   │   ├── LogId.h
│   │   ├── LogId.cpp
│   │   ├── LogConfig.h
│   │   ├── LogConfig.cpp
│   │   ├── LogAddress.h
│   │   ├── LogAddress.cpp
│   │   ├── LogHost.h
│   │   ├── LogHost.cpp
│   │   ├── LogIndex.h
│   │   ├── LogIndex.cpp
│   │   ├── GlobalLogIndex.h
│   │   ├── LogLogIndex.h
│   │   ├── LogStats.h
│   │   ├── LogStats.cpp
│   │   ├── AppendQueue.h
│   │   └── AppendQueue.cpp
│   └── persist/
│       ├── Persist.h
│       ├── Persist.cpp
│       ├── PersistedLog.h
│       ├── PersistedLog.cpp
│       ├── HotLog.h
│       ├── HotLog.cpp
│       ├── LogLog.h
│       ├── LogLog.cpp
│       └── io/
│           ├── IOOperation.h
│           ├── IOQueue.h
│           ├── IOQueue.cpp
│           ├── GlobalLogIOQueue.h
│           ├── GlobalLogIOQueue.cpp
│           ├── WriteIOOperation.h
│           ├── ReadEntryIOOperation.h
│           └── ReadEntriesIOOperation.h
├── test/
│   ├── CMakeLists.txt
│   ├── TestGlobals.cpp
│   ├── TestEntry.cpp
│   ├── TestLogId.cpp
│   ├── TestLogIndex.cpp
│   ├── TestLogConfig.cpp
│   ├── TestPersistedLog.cpp
│   ├── TestServer.cpp
│   └── TestRoundTrip.cpp    # Binary round-trip vs expected hex
├── scripts/
│   ├── e2e-test.sh
│   └── generate-test-data.mjs
└── utils/
    └── simple-load-tester.mjs   # Adapted from logsrd/utils/
```

### 3.2 Corresponding TypeScript→C++ File Map

| TypeScript | C++ | Notes |
|------------|-----|-------|
| `src/logsrd.ts` | `src/main.cpp` | Entry point + route registration |
| `src/lib/server.ts` | `src/Server.h/.cpp` | Orchestrator |
| `src/lib/persist.ts` | `src/persist/Persist.h/.cpp` | HotLog lifecycle |
| `src/lib/log.ts` | `src/log/Log.h/.cpp` | Log aggregate |
| `src/lib/subscribe.ts` | ❌ | Dropped from MVP |
| `src/lib/replicate.ts` | ❌ | Dropped from MVP |
| `src/lib/globals.ts` | `src/Globals.h` | Constants + enums |
| `src/lib/entry/*` | `src/entry/*` | 1:1 mapping |
| `src/lib/log/*` | `src/log/*` | 1:1 mapping (minus Access) |
| `src/lib/persist/*` | `src/persist/*` | 1:1 mapping |
| `src/lib/persist/io/*` | `src/persist/io/*` | 1:1 mapping |

---

## 4. Build System

### 4.1 CMake Configuration

```cmake
cmake_minimum_required(VERSION 3.20)
project(logsrdcpp VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Dependencies
find_package(OpenSSL REQUIRED)
find_package(ZLIB REQUIRED)

# µWebSockets
set(UWS_DIR "${CMAKE_SOURCE_DIR}/../uWebSockets")
set(UWS_SRC
    ${UWS_DIR}/uSockets/src/bsd.c
    ${UWS_DIR}/uSockets/src/crypto.c
    ${UWS_DIR}/uSockets/src/ctx.c
    ${UWS_DIR}/uSockets/src/eventing/epoll_kqueue.c
    ${UWS_DIR}/uSockets/src/libusockets.c
    ${UWS_DIR}/uSockets/src/socket.c
    ${UWS_DIR}/src/AsyncSocket.cpp
    ${UWS_DIR}/src/ChunkedEncoding.cpp
    ${UWS_DIR}/src/HttpContext.cpp
    ${UWS_DIR}/src/HttpErrors.cpp
    ${UWS_DIR}/src/HttpParser.cpp
    ${UWS_DIR}/src/HttpResponse.cpp
    ${UWS_DIR}/src/HttpRouter.cpp
    ${UWS_DIR}/src/Loop.cpp
    ${UWS_DIR}/src/PerMessageDeflate.cpp
    ${UWS_DIR}/src/TopicTree.cpp
    ${UWS_DIR}/src/WebSocket.cpp
    ${UWS_DIR}/src/WebSocketContext.cpp
    ${UWS_DIR}/src/WebSocketExtensions.cpp
    ${UWS_DIR}/src/WebSocketHandshake.cpp
    ${UWS_DIR}/src/WebSocketProtocol.cpp
)
include_directories(${UWS_DIR}/src ${UWS_DIR}/uSockets/src)

# simdjson (header-only or fetched via FetchContent)
include(FetchContent)
FetchContent_Declare(simdjson GIT_REPOSITORY https://github.com/simdjson/simdjson.git GIT_TAG v3.9.1)
FetchContent_MakeAvailable(simdjson)

# Catch2 (for tests)
FetchContent_Declare(Catch2 GIT_REPOSITORY https://github.com/catchorg/Catch2.git GIT_TAG v3.5.2)
FetchContent_MakeAvailable(Catch2)
```

### 4.2 Build Commands

```bash
# Configure
cmake -B build -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build build -j$(nproc)

# Run tests
./build/test/logsrdcpp-test

# Run server
DATA_DIR=./data PORT=1976 ./build/src/logsrdcpp

# E2E test
scripts/e2e-test.sh
```

### 4.3 Dependencies Summary

| Dependency | Purpose | Source |
|------------|---------|--------|
| µWebSockets + uSockets | HTTP server | `external/uWebSockets/` |
| simdjson | JSON parsing | FetchContent or system |
| zlib | CRC32 | System (`-lz`) |
| OpenSSL | Random bytes, base64 | System (`-lssl -lcrypto`) |
| Catch2 | Unit tests | FetchContent |
| fmt (optional) | String formatting | FetchContent or bundled |

---

## 5. Phase 1 — Foundation & Binary Format

### 5.1 Objective

Build the project skeleton and all entry type classes with bit-exact binary serialization. No file I/O, no networking — pure data classes validated by round-trip tests.

### 5.2 Files to Create

#### `CMakeLists.txt` (root + src/)

Project-level and src-level CMake configuration.

#### `src/Globals.h`

```cpp
#pragma once
#include <cstdint>
#include <string_view>
#include <vector>

namespace logsrd {

// Constants
inline constexpr size_t GLOBAL_LOG_PREFIX_BYTE_LENGTH = 27;
inline constexpr size_t LOG_LOG_PREFIX_BYTE_LENGTH = 11;
inline constexpr size_t GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH = 9;
inline constexpr size_t LOG_LOG_CHECKPOINT_BYTE_LENGTH = 13;
inline constexpr size_t GLOBAL_LOG_CHECKPOINT_INTERVAL = 131072;  // 128 KB
inline constexpr size_t LOG_LOG_CHECKPOINT_INTERVAL = 131072;      // 128 KB
inline constexpr size_t GLOBAL_INDEX_COUNT_LIMIT = 100000;
inline constexpr size_t MAX_ENTRY_SIZE = 32768;                    // 32 KB
inline constexpr size_t MAX_LOG_SIZE = 16777216;                   // 16 MB
inline constexpr size_t MAX_RESPONSE_ENTRIES = 100;
inline constexpr std::string_view DEFAULT_HOT_LOG_FILE_NAME = "global-hot.log";
inline constexpr size_t HOT_LOG_LOG_FILE_NAME_SIZE = 15;

// Entry type enum
enum class EntryType : uint8_t {
    GLOBAL_LOG = 0,
    LOG_LOG = 1,
    GLOBAL_LOG_CHECKPOINT = 2,
    LOG_LOG_CHECKPOINT = 3,
    COMMAND = 4,
    BINARY = 5,
    JSON = 6,
};

// Command name enum
enum class CommandName : uint8_t {
    CREATE_LOG = 0,
    SET_CONFIG = 1,
};

// IO operation type enum
enum class IOOperationType : uint8_t {
    READ_ENTRY = 0,
    READ_ENTRIES = 1,
    READ_RANGE = 2,
    WRITE = 3,
};

} // namespace logsrd
```

#### `src/entry/LogEntry.h`

Abstract base class defining the serialization contract:

```cpp
#pragma once
#include <cstdint>
#include <vector>
#include <span>
#include <expected>

namespace logsrd {

class LogEntry {
public:
    virtual ~LogEntry() = default;

    // Serialize to single contiguous buffer
    virtual std::vector<uint8_t> u8() const = 0;

    // Serialize to ordered array of chunks (allows zero-copy prefix
    // concatenation for GlobalLogEntry / LogLogEntry wrappers)
    virtual std::vector<std::span<const uint8_t>> u8s() const = 0;

    // Total on-wire byte length
    virtual size_t byteLength() const = 0;

    // Compute CRC32 checksum scoped to entryNum
    virtual uint32_t cksum(uint32_t entryNum) const = 0;

    // Verify stored CRC matches computed CRC
    virtual bool verify() const = 0;

    // Type discriminator
    virtual EntryType type() const = 0;
};

} // namespace logsrd
```

#### `src/entry/GlobalLogEntry.h/.cpp`

27-byte prefix wrapper. Key methods:

```cpp
class GlobalLogEntry : public LogEntry {
    LogId logId_;
    uint32_t entryNum_;
    std::unique_ptr<LogEntry> entry_;
    uint32_t crc_;        // stored CRC (0 = unknown)
    mutable uint32_t cksumNum_{0};  // cached computed CRC
    mutable bool cksumCached_{false};
    mutable std::optional<std::vector<uint8_t>> prefixU8_;  // cached prefix

public:
    GlobalLogEntry(LogId logId, uint32_t entryNum, std::unique_ptr<LogEntry> entry, uint32_t crc = 0);

    // Accessors
    const LogId& logId() const { return logId_; }
    uint32_t entryNum() const { return entryNum_; }
    const LogEntry& entry() const { return *entry_; }

    // Composite key: "logId-entryNum"
    std::string key() const;

    // 27-byte prefix (lazily built, cached)
    const std::vector<uint8_t>& prefixU8() const;

    // CRC32 of (entryNum, entry bytes)
    uint32_t cksum(uint32_t entryNum) const override;

    // crc != 0 && crc == cksum()
    bool verify() const override;

    // Return raw inner entry bytes
    std::vector<uint8_t> u8() const override;

    // [prefixU8, ...inner.u8s()]
    std::vector<std::span<const uint8_t>> u8s() const override;

    size_t byteLength() const override;
    EntryType type() const override { return EntryType::GLOBAL_LOG; }
};
```

#### `src/entry/LogLogEntry.h/.cpp`

11-byte prefix wrapper. Same pattern as GlobalLogEntry but without LogId.

#### `src/entry/JSONLogEntry.h/.cpp`

Wraps a JSON string. Two construction modes: from string or from bytes.
- `u8()` returns UTF-8 encoded bytes
- `str()` returns decoded string
- 1-byte type prefix + payload

#### `src/entry/BinaryLogEntry.h/.cpp`

Wraps opaque `Uint8Array`. Simplest entry type.
- `u8()` returns raw bytes
- 1-byte type prefix + payload

#### `src/entry/CommandLogEntry.h/.cpp`

Command entry with 1-byte command name + variable value.
- `u8s()` returns `[typeByte, commandName, commandValue]`
- `value()` throws `NotImplemented` (subclasses override)

#### `src/entry/GlobalLogCheckpoint.h/.cpp`

Fixed 9-byte checkpoint entry:
- `lastEntryOffset` (int16 LE, negative offset to last entry)
- `lastEntryLength` (uint16 LE)
- CRC32 over type byte + 4-byte payload

#### `src/entry/LogLogCheckpoint.h/.cpp`

Fixed 13-byte checkpoint entry:
- Same as GlobalLogCheckpoint + `lastConfigOffset` (uint32 LE)

#### `src/entry/EntryFactory.h/.cpp`

Top-level deserialization dispatcher:

```cpp
namespace logsrd {

struct EntryFactory {
    // Deserialize complete entry from buffer
    static std::unique_ptr<LogEntry> fromU8(std::span<const uint8_t> data);

    // Partial deserialization (stream read)
    struct PartialResult {
        std::unique_ptr<LogEntry> entry;
        size_t needBytes{0};
        std::string error;
    };
    static PartialResult fromPartialU8(std::span<const uint8_t> data);
};

} // namespace logsrd
```

#### `src/entry/command/JSONCommandType.h/.cpp`

Base for JSON-valued commands (`CreateLogCommand`, `SetConfigCommand`).
- Two construction modes: raw-bypass (bytes) or value-based (JSON)
- `value()` parses `commandValueU8` as JSON via simdjson
- `setValue()` serializes value to JSON bytes

#### `src/entry/command/CreateLogCommand.h`

```cpp
#pragma once
#include "JSONCommandType.h"

namespace logsrd {

class CreateLogCommand : public JSONCommandType {
public:
    static constexpr CommandName COMMAND_NAME = CommandName::CREATE_LOG;
    static constexpr uint8_t COMMAND_NAME_BYTE = 0x00;

    explicit CreateLogCommand(Args args);
};

} // namespace logsrd
```

#### `src/entry/command/SetConfigCommand.h`

Same pattern as CreateLogCommand with `COMMAND_NAME_BYTE = 0x01`.

#### `src/log/LogId.h/.cpp`

16-byte identifier:

```cpp
class LogId {
    uint8_t bytes_[16];

public:
    // Generate random LogId
    static LogId newRandom();

    // From raw bytes
    static LogId fromBytes(std::span<const uint8_t, 16> bytes);

    // From base64url string
    static LogId fromBase64(std::string_view base64);

    // Base64url encoded (22 chars, no padding)
    std::string base64() const;

    // Two-level hex directory prefix ("ab/cd")
    std::string logDirPrefix() const;

    // Raw bytes
    std::span<const uint8_t, 16> bytes() const { return bytes_; }

    bool operator==(const LogId& other) const;
};
```

#### `src/log/LogIndex.h/.cpp`

In-memory entry triplet index:

```cpp
class LogIndex {
    std::vector<uint32_t> en_;  // [entryNum, offset, length, ...]
    uint32_t lcNum_{0};         // last config entry number
    uint32_t lcOff_{0};         // last config offset
    uint32_t lcLen_{0};         // last config length
    bool hasConfig_{false};

public:
    void addEntry(EntryType type, uint32_t entryNum, uint32_t offset, uint32_t length);
    bool hasEntry(uint32_t entryNum) const;
    std::tuple<uint32_t, uint32_t, uint32_t> entry(uint32_t entryNum) const;  // [offset, length, entryNum]
    const std::vector<uint32_t>& entries() const { return en_; }
    size_t entryCount() const { return en_.size() / 3; }
    void appendIndex(const LogIndex& other);
    uint64_t byteLength(uint32_t prefixByteLength) const;
    bool hasConfig() const { return hasConfig_; }
    std::tuple<uint32_t, uint32_t, uint32_t> lastConfig() const;
    uint32_t lastConfigEntryNum() const;
    bool hasEntries() const { return en_.size() >= 3; }
    std::tuple<uint32_t, uint32_t, uint32_t> lastEntry() const;
    uint32_t maxEntryNum() const;
};
```

#### `src/log/GlobalLogIndex.h`

```cpp
#pragma once
#include "LogIndex.h"
#include "../Globals.h"

namespace logsrd {

class GlobalLogIndex : public LogIndex {
public:
    uint64_t byteLength() const {
        return LogIndex::byteLength(GLOBAL_LOG_PREFIX_BYTE_LENGTH);
    }
};

} // namespace logsrd
```

#### `src/log/LogLogIndex.h`

Same pattern as GlobalLogIndex but uses `LOG_LOG_PREFIX_BYTE_LENGTH`.

#### `src/log/LogHost.h`

```cpp
#pragma once
#include <string>
#include <vector>

namespace logsrd {

struct LogHost {
    std::string master;
    std::vector<std::string> replicas;

    static LogHost fromString(std::string_view s);
    std::string toString() const;
};

} // namespace logsrd
```

#### `src/log/LogAddress.h`

```cpp
#pragma once
#include <string>
#include <optional>
#include "LogHost.h"

namespace logsrd {

struct LogAddress {
    std::string logIdBase64;
    std::optional<LogHost> host;
    std::vector<LogHost> config;

    static LogAddress fromString(std::string_view s);
    std::string toString() const;
};

} // namespace logsrd
```

#### `src/log/LogConfig.h/.cpp`

Per-log configuration with simdjson validation:

```cpp
struct ILogConfig {
    std::string logId;
    std::string type;       // "binary" or "json"
    std::string master;
    std::vector<std::string> replicas;
    std::vector<std::string> asyncReplicas;
    std::string access;     // "public", "private", "readOnly", "writeOnly"
    std::string authType;   // "token" or "jwt"
    // MVP: auth fields parsed for binary compat but not enforced
    std::string accessToken;
    std::string adminToken;
    std::string readToken;
    std::string writeToken;
    std::string superToken;
    bool stopped{false};
    std::optional<LogAddress> configLogAddress;
};

class LogConfig {
    ILogConfig config_;

public:
    static std::expected<LogConfig, std::string> newFromJSON(std::string_view json);

    const ILogConfig& config() const { return config_; }
    std::vector<std::string> replicationGroup() const;
    void setDefaults();
};
```

### 5.3 Key Implementation Details

#### CRC32 Computation

```cpp
// In a utility header or cpp file:
#include <zlib.h>

inline uint32_t crc32_combine(std::span<const uint8_t> data, uint32_t seed = 0) {
    return crc32(seed, data.data(), data.size());
}

// For chained CRC computation (matching @node-rs/crc32 behavior):
// cksum = crc32(data, crc32(prevCrc, ...))
```

**Important**: zlib's `crc32()` with initial value `0` and no post-XOR produces the same result as `@node-rs/crc32`'s default. Test this against Node.js output in Phase 1.

#### base64url Encoding

```cpp
#include <openssl/bio.h>
#include <openssl/evp.h>

inline std::string base64urlEncode(std::span<const uint8_t> data) {
    BIO *bio = BIO_new(BIO_s_mem());
    BIO *b64 = BIO_new(BIO_f_base64());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    bio = BIO_push(b64, bio);
    BIO_write(bio, data.data(), data.size());
    (void)BIO_flush(bio);

    BUF_MEM *bufferPtr;
    BIO_get_mem_ptr(bio, &bufferPtr);

    std::string result(bufferPtr->data, bufferPtr->length);

    // Convert to base64url: replace + with -, / with _, remove padding =
    for (auto& c : result) {
        if (c == '+') c = '-';
        else if (c == '/') c = '_';
    }
    while (!result.empty() && result.back() == '=') result.pop_back();

    BIO_free_all(bio);
    return result;
}

inline std::vector<uint8_t> base64urlDecode(std::string_view input) {
    // Reverse: add padding, replace - with +, _ with /
    std::string standard(input);
    for (auto& c : standard) {
        if (c == '-') c = '+';
        else if (c == '_') c = '/';
    }
    while (standard.size() % 4) standard.push_back('=');

    // Decode via OpenSSL
    // ...
}
```

### 5.4 Validation Criteria for Phase 1

1. Every entry type round-trips: `construct → u8s() → concat → fromU8()` produces an equivalent entry
2. `byteLength()` matches the TS version for every entry type
3. CRC32 matches Node.js `@node-rs/crc32` for known test vectors
4. base64url encoding matches Node.js `Buffer.toString("base64url")`
5. `LogIndex` arithmetic (offset lookups, byteLength, appendIndex) matches TS
6. `LogId::newRandom()` produces 16 bytes with correct entropy
7. All tests pass under Catch2

---

## 6. Phase 2 — Persistence Layer

### 6.1 Objective

Implement the file I/O layer: file handle pool, I/O queue, checkpoint-aware reads/writes, hot log lifecycle management. All operations are synchronous (`pread`/`pwritev`).

### 6.2 Files to Create

#### `src/persist/io/IOOperation.h`

Base class for all I/O operations. Uses a completion callback instead of promises:

```cpp
#pragma once
#include <cstdint>
#include <functional>
#include <chrono>

namespace logsrd {

class IOOperation {
public:
    using CompleteCallback = std::function<void(IOOperation&)>;

    IOOperationType opType;
    uint64_t order;      // global monotonic order
    uint64_t startTime;  // steady_clock timestamp
    uint64_t endTime{0};
    bool processing{false};
    CompleteCallback onComplete;
    CompleteCallback onError;

    IOOperation(IOOperationType type, CompleteCallback onComplete, CompleteCallback onError)
        : opType(type)
        , order(nextOrder())
        , startTime(now())
        , onComplete(std::move(onComplete))
        , onError(std::move(onError))
    {}

    void complete() { endTime = now(); if (onComplete) onComplete(*this); }
    void completeWithError() { endTime = now(); if (onError) onError(*this); }

private:
    static uint64_t nextOrder() {
        static std::atomic<uint64_t> counter{0};
        return counter++;
    }
    static uint64_t now() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }
};

} // namespace logsrd
```

#### `src/persist/io/WriteIOOperation.h`

```cpp
#pragma once
#include "IOOperation.h"
#include "../../entry/LogEntry.h"
#include <memory>
#include <vector>

namespace logsrd {

class WriteIOOperation : public IOOperation {
public:
    std::unique_ptr<LogEntry> entry;
    uint32_t entryNum{0};
    size_t bytesWritten{0};

    WriteIOOperation(std::unique_ptr<LogEntry> entry, CompleteCallback onComplete, CompleteCallback onError)
        : IOOperation(IOOperationType::WRITE, std::move(onComplete), std::move(onError))
        , entry(std::move(entry))
    {}
};

} // namespace logsrd
```

#### `src/persist/io/ReadEntryIOOperation.h`

```cpp
#pragma once
#include "IOOperation.h"
#include "../../log/LogIndex.h"

namespace logsrd {

class ReadEntryIOOperation : public IOOperation {
public:
    LogIndex* index;
    uint32_t entryNum;
    std::unique_ptr<LogEntry> resultEntry;
    size_t bytesRead{0};

    ReadEntryIOOperation(LogIndex* idx, uint32_t entryNum, CompleteCallback onComplete, CompleteCallback onError)
        : IOOperation(IOOperationType::READ_ENTRY, std::move(onComplete), std::move(onError))
        , index(idx), entryNum(entryNum)
    {}
};

} // namespace logsrd
```

#### `src/persist/io/ReadEntriesIOOperation.h`

Same pattern but with `std::vector<uint32_t> entryNums` and `std::vector<std::unique_ptr<LogEntry>> entries`.

#### `src/persist/io/IOQueue.h/.cpp`

Dual read/write queue:

```cpp
class IOQueue {
    std::vector<IOOperation*> readQueue_;
    std::vector<IOOperation*> writeQueue_;

public:
    void enqueue(IOOperation* op);
    std::pair<std::span<IOOperation*>, std::span<IOOperation*>> getReady();
    std::pair<std::span<IOOperation*>, std::span<IOOperation*>> drain();
    bool opPending() const;
};
```

#### `src/persist/io/GlobalLogIOQueue.h/.cpp`

Per-log partitioned queue:

```cpp
class GlobalLogIOQueue {
    std::unordered_map<std::string, std::unique_ptr<IOQueue>> queues_;  // keyed by LogId base64
    IOQueue globalQueue_;

public:
    void enqueue(IOOperation* op, const std::string& logIdBase64);
    std::unique_ptr<IOQueue> deleteLogQueue(const std::string& logIdBase64);
    IOQueue* getLogQueue(const std::string& logIdBase64, bool create = true);
    std::pair<std::vector<IOOperation*>, std::vector<IOOperation*>> getReady();
    bool opPending() const;
};
```

**Global reordering**: `getReady()` collects ops from all per-log queues + global queue, then sorts by `order` field to maintain total ordering.

#### `src/persist/PersistedLog.h/.cpp`

Abstract base for file-backed logs:

```cpp
class PersistedLog {
protected:
    std::string logFile_;
    int writeFd_{-1};
    std::vector<int> freeReadFds_;
    std::vector<int> openReadFds_;
    size_t maxReadFds_{1};
    size_t byteLength_{0};
    bool ioBlocked_{false};

    // IO queues — subclass chooses which type
    IOQueue* ioQueue_{nullptr};
    GlobalLogIOQueue* globalIOQueue_{nullptr};

public:
    PersistedLog(std::string logFile);
    virtual ~PersistedLog();

    // Lifecycle
    virtual void init(
        EntryType entryType,
        size_t checkpointInterval,
        size_t checkpointByteLength
    );

    // IO control
    void blockIO();
    void unblockIO();
    void closeAllFds();

    // File handle management
    int getReadFd();
    void doneReadFd(int fd);
    void closeReadFd(int fd);
    int getWriteFd();
    void closeWriteFd();

    // Operation dispatch
    void enqueueOp(IOOperation* op, const std::string& logIdBase64 = "");
    void processOps();

    // Read/write processing (override in subclasses)
    virtual void processWriteOps(std::span<IOOperation*> ops) = 0;
    virtual void processReadOps(std::span<IOOperation*> ops) = 0;

    // Checkpoint-aware read
    virtual std::pair<std::unique_ptr<LogEntry>, size_t> processReadLogEntry(
        int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
        size_t checkpointInterval, size_t checkpointByteLength,
        EntryType entryType, size_t prefixLength
    ) = 0;

    size_t byteLength() const { return byteLength_; }
    void truncate(size_t byteLength);
};
```

**`init()` method** — checkpoint scan from existing file:

```
open(logFile, O_RDONLY)
if (ENOENT) → return (empty file, byteLength = 0)
for each checkpointInterval chunk:
    read(buffer) at current offset
    parse checkpoint entry
    reconstruct straddling entries
    call subclass initEntry(entry, offset)
set byteLength to final offset
```

#### `src/persist/HotLog.h/.cpp`

Global hot log:

```cpp
class HotLog : public PersistedLog {
public:
    static constexpr size_t MAX_READ_FDS = 16;
    bool isNew_;  // true = "newHot", false = "oldHot"

    HotLog(const std::string& dataDir, const std::string& fileName, bool isNew);
    std::string logName() const;

    void processWriteOps(std::span<IOOperation*> ops) override;
    void processReadOps(std::span<IOOperation*> ops) override;
    std::pair<std::unique_ptr<LogEntry>, size_t> processReadLogEntry(
        int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
        size_t checkpointInterval, size_t checkpointByteLength,
        EntryType entryType, size_t prefixLength
    ) override;
    void init() override;

    virtual void addEntryToIndex(uint32_t entryNum, uint32_t offset, uint32_t length, bool isNew);
};
```

**`processWriteOps()` logic**:

```
for each op:
    compute nextCheckpointOffset
    if current position crosses checkpoint boundary:
        create GlobalLogCheckpoint(lastEntryOffset, lastEntryLength)
        split entry, insert checkpoint u8s before entry
    else if at boundary exactly:
        insert checkpoint before entry
    else:
        append entry u8s normally
    update lastEntryOffset/lastEntryLength for next checkpoint

writev(all buffers)
datasync()
byteLength += written
for each op:
    addEntryToIndex(entryNum, offset, byteLength)
    op.complete()
```

**`processReadLogEntry()` logic**:

```
compute nextCheckpointOffset
if entry crosses checkpoint boundary:
    read(length + CHECKPOINT_BYTE_LENGTH)
    stitch: Buffer.concat skipping checkpoint bytes
else:
    read(length)

GlobalLogEntryFactory::fromU8(buffer)
verify(logId, crc, entryNum)
return {entry, bytesRead}
```

#### `src/persist/LogLog.h/.cpp`

Per-log persistent file. Same pattern as HotLog but:
- Uses `LogLogEntryFactory` / `LogLogCheckpoint`
- Includes `lastConfigOffset` in checkpoints
- Returns per-log index

```cpp
class LogLog : public PersistedLog {
public:
    static constexpr size_t MAX_READ_FDS = 4;

    LogLog(const std::string& logFile);
    std::string logName() const;

    void processWriteOps(std::span<IOOperation*> ops) override;
    void processReadOps(std::span<IOOperation*> ops) override;
    std::pair<std::unique_ptr<LogEntry>, size_t> processReadLogEntry(
        int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
        size_t checkpointInterval, size_t checkpointByteLength,
        EntryType entryType, size_t prefixLength
    ) override;
    void init() override;
};
```

#### `src/persist/Persist.h/.cpp`

Hot log lifecycle coordinator:

```cpp
class Persist {
    Server* server_;
    std::unique_ptr<HotLog> newHotLog_;
    std::unique_ptr<HotLog> oldHotLog_;

    // In-progress guards (simulating the TS promise pattern)
    bool emptyInProgress_{false};
    bool moveInProgress_{false};

    // Monitor timer
    uWS::Timer* monitorTimer_{nullptr};

public:
    Persist(Server* server, const std::string& dataDir);
    ~Persist();

    void init();
    void startMonitor();
    void stopMonitor();

    // Called from monitor tick
    void monitor();

    // Rotation operations
    void moveNewToOldHotLog();
    void emptyOldHotLog();

    HotLog* newHotLog() const { return newHotLog_.get(); }
    HotLog* oldHotLog() const { return oldHotLog_.get(); }

    // Global entry count across all logs
    size_t globalIndexEntryCount() const;
};
```

**`monitor()` tick** (every 10 seconds):

```
if emptyInProgress_ || moveInProgress_ → return
if oldHotLog_ has entries → emptyOldHotLog()
else if newHotLog_ exceeds limit → moveNewToOldHotLog()
```

**`moveNewToOldHotLog()`**:

```
blockIO() on newHotLog
closeAllFds()
rename(newHotLogFile, oldHotLogFile)
swap references (new → old)
for each Log in server:
    log.moveNewToOldHotLog()  // transfer index
unblockIO() on oldHotLog
processOps() on both
```

**`emptyOldHotLog()`**:

```
blockIO() on oldHotLog
closeAllFds()
for each Log with entries in oldHotLog:
    read entries → create LogLog writes → enqueue
    log.emptyOldHotLog()
delete oldHotLog file
create fresh oldHotLog
```

### 6.3 Validation Criteria for Phase 2

1. Write entries → sync → read back: contents match
2. Checkpoint insertion at 128KB boundaries (verify byte offsets)
3. Recovery from existing file: `init()` rebuilds index correctly from checkpoint scan
4. Straddling entries (crossing checkpoint boundary) read correctly
5. `moveNewToOldHotLog()` produces correct file rename + index transfer
6. `emptyOldHotLog()` correctly drains entries to LogLog
7. CRC verification rejects corrupted entries
8. Concurrent reads and writes on the same file behave correctly

---

## 7. Phase 3 — Log Abstraction & HTTP Server

### 7.1 Objective

Wire up the Log aggregate root, the AppendQueue serializer, and the Server orchestrator with HTTP routes via µWebSockets.

### 7.2 Files to Create

#### `src/log/Log.h/.cpp`

Central log aggregate:

```cpp
class Log {
    LogId logId_;
    LogConfig config_;
    LogStats stats_;

    // Three-tier index
    std::unique_ptr<GlobalLogIndex> newHotLogIndex_;
    std::unique_ptr<GlobalLogIndex> oldHotLogIndex_;
    std::unique_ptr<LogLogIndex> logLogIndex_;

    // Per-log persistence
    std::unique_ptr<LogLog> logLog_;

    // Append serialization
    std::unique_ptr<AppendQueue> appendQueue_;
    AppendQueue* currentAppendQueue_{nullptr};

    bool creating_{false};
    bool stopped_{false};
    std::string logDir_;  // directory for per-log files

public:
    Log(LogId logId, LogConfig config, const std::string& dataDir);

    const LogId& logId() const { return logId_; }
    LogConfig& config() { return config_; }
    const LogConfig& config() const { return config_; }
    LogStats& stats() { return stats_; }

    // Lazy-init LogLog
    LogLog* getLogLog();

    // Lifecycle
    std::string filename() const;
    void stop() { stopped_ = true; }

    // Append. Returns {entryNum, crc} on success
    struct AppendResult { uint32_t entryNum; uint32_t crc; };
    std::expected<AppendResult, std::string> append(std::unique_ptr<LogEntry> entry, LogConfig* config = nullptr);

    // Immediate write to hot log (for replication ingest)
    void appendOp(std::unique_ptr<LogEntry> entry);

    // Create log with first entry
    std::expected<AppendResult, std::string> create(LogConfig* config);

    // Read operations
    std::expected<std::unique_ptr<LogEntry>, std::string> getHead();
    std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> getEntries(uint32_t offset, uint32_t limit);
    std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> getEntryNums(std::span<const uint32_t> entryNums);

    // Config read/write
    std::expected<std::unique_ptr<LogEntry>, std::string> getConfig();
    std::expected<AppendResult, std::string> setConfig(std::string_view json, uint32_t lastConfigNum);

    // Rotation helpers
    void moveNewToOldHotLog();
    void emptyOldHotLog(Persist* persist);
};
```

**`append()` flow**:

```
create GlobalLogEntry wrapper
enqueue on AppendQueue
AppendQueue::process():
    create WriteIOOperation(globalLogEntry)
    enqueue on HotLog via Persist
    wait for write completion (synchronous in MVP)
    stats.addOp()
    return {entryNum, crc}
```

#### `src/log/AppendQueue.h/.cpp`

Write serializer:

```cpp
class AppendQueue {
    struct Entry {
        std::unique_ptr<GlobalLogEntry> entry;
        LogConfig* config{nullptr};
    };
    std::vector<Entry> entries_;
    AppendQueue* next_{nullptr};  // chained queues for sequential processing

public:
    // Enqueue and trigger processing
    void enqueue(std::unique_ptr<GlobalLogEntry> entry, LogConfig* config = nullptr);

    // Process all entries in this queue
    void process(Log& log, Persist* persist);
};
```

**`process()` logic** (simplified for MVP — no replication, no pub/sub):

```
if log.stopped_ → completeWithError, return
for each entry:
    if entry has config → update log.config
    if log.stopped_ or config.stopped → fatal error, break

    // Persist to HotLog (new)
    auto writeOp = WriteIOOperation(entry)
    persist->newHotLog()->enqueueOp(&writeOp)
    persist->newHotLog()->processOps()  // synchronous write
    if writeOp succeeded:
        log.stats_.addOp(&writeOp)
    else:
        fatal error, log.stop(), break
```

#### `src/log/LogConfig.h/.cpp`

Configuration with simdjson validation:

```cpp
struct ILogConfig { /* as defined in Phase 1 */ };

class LogConfig {
    ILogConfig config_;

    // Protected properties (stripped from config responses)
    static constexpr std::array<std::string_view, 7> PROTECTED_PROPERTIES = {
        "accessToken", "adminToken", "readToken", "writeToken", "superToken",
        "jwtProperties", "jwtSecret"
    };

public:
    static std::expected<LogConfig, std::string> newFromJSON(std::string_view json);
    void setDefaults();

    // Serialize to JSON (with optional meta wrapper, filtered protected props)
    std::string toJSON(bool meta = false) const;

    // Validate via simdjson
    std::expected<void, std::string> validate() const;
};
```

**JSON Schema validation via simdjson**:

```
parse JSON with simdjson::padded_string
validate required fields: logId (string), type ("binary"|"json"), master (string), access (...), authType (...), stopped (bool)
apply defaults: generate accessToken if missing, generate jwtSecret if missing
validate mutual exclusivity: authType "token" with jwtSecret → error, authType "jwt" with tokens → error
```

#### `src/log/LogStats.h`

```cpp
struct LogStats {
    uint64_t ioReads{0};
    uint64_t bytesRead{0};
    double ioReadTimeAvg{0};
    double ioReadTimeMax{0};
    uint64_t ioReadLastTime{0};

    uint64_t ioWrites{0};
    uint64_t bytesWritten{0};
    double ioWriteTimeAvg{0};
    double ioWriteTimeMax{0};
    uint64_t ioWriteLastTime{0};

    void addOp(IOOperation& op);
};
```

#### `src/Server.h/.cpp`

Central orchestrator:

```cpp
class Server {
    struct ServerConfig {
        std::string host = "127.0.0.1:1976";
        std::string dataDir = "./data";
        size_t globalIndexCountLimit = GLOBAL_INDEX_COUNT_LIMIT;
        std::string hotLogFileName{DEFAULT_HOT_LOG_FILE_NAME};
    };

    ServerConfig config_;
    std::unique_ptr<Persist> persist_;
    std::unordered_map<std::string, std::unique_ptr<Log>> logs_;  // keyed by LogId base64

public:
    Server(const ServerConfig& config);
    ~Server();
    void init();

    Persist* persist() const { return persist_.get(); }

    // Public API
    std::expected<std::unique_ptr<LogEntry>, std::string> createLog(const std::string& configJson);
    std::expected<std::unique_ptr<LogEntry>, std::string> appendLog(
        const std::string& logIdBase64, std::span<const uint8_t> data,
        std::optional<uint32_t> lastEntryNum = std::nullopt);
    std::expected<std::unique_ptr<LogEntry>, std::string> getConfig(const std::string& logIdBase64);
    std::expected<std::unique_ptr<LogEntry>, std::string> setConfig(
        const std::string& logIdBase64, std::string_view json, uint32_t lastConfigNum);
    std::expected<std::unique_ptr<LogEntry>, std::string> getHead(const std::string& logIdBase64);
    std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> getEntries(
        const std::string& logIdBase64, std::optional<uint32_t> offset,
        std::optional<uint32_t> limit, std::optional<std::vector<uint32_t>> entryNums);

    Log* getLog(const std::string& logIdBase64);
    void delLog(const std::string& logIdBase64);
};
```

**`createLog()` flow**:

```
parse configJson with LogConfig::newFromJSON
auto logId = LogId::newRandom()
config.setDefaults()
auto log = Log(logId, config, dataDir)
log.initExisting()  // check if log exists on disk (for recovery)
auto createCmd = CreateLogCommand({value: configJson})
auto result = log.create(createCmd)
logs_[logId.base64()] = std::move(log)
return result
```

**`appendLog()` flow**:

```
auto* log = getLog(logIdBase64)
if (!log) → error "Invalid log id"
if (log->stopped()) → error "Log is stopped"

// Determine entry type from config
auto entry = (log->config().type == "json")
    ? JSONLogEntry(data)
    : BinaryLogEntry(data)

auto result = log->append(std::move(entry))
return result  // {entryNum, crc}
```

#### `src/main.cpp`

Entry point with HTTP route registration via uWS:

```cpp
#include <iostream>
#include <cstdlib>
#include <string>
#include "App.h"
#include "Server.h"

int main() {
    // Parse environment
    Server::ServerConfig config;
    if (auto* env = std::getenv("DATA_DIR")) config.dataDir = env;
    if (auto* env = std::getenv("PORT")) config.host = "0.0.0.0:" + std::string(env);
    if (auto* env = std::getenv("HOT_LOG_FILE_NAME")) config.hotLogFileName = env;

    // Create server
    auto server = std::make_shared<Server>(config);
    server->init();

    // Create uWS app
    uWS::App app;

    // POST /log — createLog
    app.post("/log", [server](auto* res, auto* req) {
        // Read body (uWS onData pattern)
        // ...
        auto result = server->createLog(body);
        if (result) {
            auto bytes = (*result)->u8s();
            res->writeStatus("200 OK");
            res->end(std::string_view((const char*)bytes[0].data(), bytes[0].size()));
        } else {
            res->writeStatus("400 Bad Request");
            res->end(result.error());
        }
    });

    // POST /log/:logid — appendLog
    app.post("/log/:logid", [server](auto* res, auto* req) {
        std::string logId = req->getParameter("logid");
        // Read body
        // Parse optional lastEntryNum from query
        // ...
        auto result = server->appendLog(logId, body, lastEntryNum);
        if (result) {
            // Return JSON {entryNum, crc}
            res->writeStatus("200 OK");
            res->end(jsonResponse);
        } else {
            // Return appropriate error code
        }
    });

    // GET /log/:logid/config
    app.get("/log/:logid/config", [server](auto* res, auto* req) {
        // ...
    });

    // PATCH /log/:logid/config
    app.patch("/log/:logid/config", [server](auto* res, auto* req) {
        // ...
    });

    // GET /log/:logid/head
    app.get("/log/:logid/head", [server](auto* res, auto* req) {
        // ...
    });

    // GET /log/:logid/entries
    app.get("/log/:logid/entries", [server](auto* res, auto* req) {
        // Parse offset, limit, entryNums from query string
        // ...
    });

    // GET /version
    app.get("/version", [](auto* res, auto* /*req*/) {
        res->writeStatus("200 OK");
        res->end("0.0.1");
    });

    // GET /admin/move-new-to-old-hot-log
    app.get("/admin/move-new-to-old-hot-log", [server](auto* res, auto* /*req*/) {
        server->persist()->moveNewToOldHotLog();
        res->writeStatus("200 OK");
        res->end("moved");
    });

    // GET /admin/empty-old-hot-log
    app.get("/admin/empty-old-hot-log", [server](auto* res, auto* /*req*/) {
        server->persist()->emptyOldHotLog();
        res->writeStatus("200 OK");
        res->end("emptied");
    });

    // Listen
    auto colonPos = config.host.find(':');
    std::string host = config.host.substr(0, colonPos);
    int port = std::stoi(config.host.substr(colonPos + 1));

    app.listen(host, port, [port](auto* listenSocket) {
        if (listenSocket) {
            std::cout << "Listening on " << host << ":" << port << std::endl;
        } else {
            std::cerr << "Failed to bind to " << host << ":" << port << std::endl;
        }
    });

    app.run();
}
```

#### uWS Body Reading Pattern

uWS does not buffer POST bodies automatically. Use the `onData` / `onAborted` pattern:

```cpp
// In each POST/PATCH handler:
struct PostData {
    std::vector<uint8_t> buffer;
    bool aborted{false};
};

auto* postData = new PostData();

res->onAborted([postData, res]() {
    postData->aborted = true;
    delete postData;
});

res->onData([postData, res, handler](std::string_view chunk, bool isLast) {
    if (postData->aborted) return;

    postData->buffer.insert(postData->buffer.end(), chunk.begin(), chunk.end());

    if (postData->buffer.size() > MAX_ENTRY_SIZE) {
        res->close();  // oversized body
        delete postData;
        return;
    }

    if (isLast) {
        handler(res, postData->buffer);
        delete postData;
    }
});
```

### 7.3 Route Handlers Detail

#### `POST /log` — createLog

- Request: `Content-Type: application/json` body with config object (may be `{}`)
- Response 200: Binary `LogLogEntry.u8()` bytes
- Response 400: Error JSON

#### `POST /log/:logid` — appendLog

- Request: Raw bytes body, optional `?lastEntryNum=<int>` query for OCC
- Response 200: `{"entryNum": N, "crc": M}`
- Response 400: `MAX_POST_SIZE_ERROR`, `INVALID_LAST_ENTRY_NUM_ERROR`
- Response 404: Invalid log id
- Response 409: `lastEntryNum mismatch`

#### `GET /log/:logid/config`

- Query: `?meta=true` wraps result in `{"entryNum", "crc", "entry": ...}`
- Response 200: JSON config object (protected properties filtered)

#### `PATCH /log/:logid/config`

- Query: `?lastConfigNum=<int>` (required, OCC guard)
- Body: JSON partial config
- Response 200: Full config JSON

#### `GET /log/:logid/head`

- Returns latest entry across all tiers
- Command entries serialized as JSON, binary entries as raw bytes
- Response 200: Entry content

#### `GET /log/:logid/entries`

- Query: `?offset=<n>&limit=<n>` or `?entryNums=<csv>` or `?meta=true`
- JSON logs → JSON array response
- Binary logs → concatenated binary response
- Response 200: Entry array or binary

### 7.4 LogConfig Environment Variables (MVP)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATA_DIR` | `./data` | Root directory for log storage |
| `PORT` | `1976` | HTTP server listen port |
| `HOT_LOG_FILE_NAME` | `"global-hot.log"` | Global hot log filename |
| `GLOBAL_INDEX_COUNT_LIMIT` | `100000` | Max entries before hot log rotation |

### 7.5 Validation Criteria for Phase 3

1. `POST /log` with empty body `{}` → 200, returns binary entry
2. `POST /log/:logid` with JSON body → 200, returns `{"entryNum":0,"crc":N}`
3. `GET /log/:logid/head` → returns latest entry
4. `GET /log/:logid/entries?offset=0&limit=10` → returns ≤10 entries
5. `GET /log/:logid/config` → returns JSON config
6. `PATCH /log/:logid/config` → updates and returns new config
7. `GET /version` → returns `"0.0.1"`
8. `POST /log/short` → 404 Invalid log id
9. `POST /log/:logid?lastEntryNum=999` → 409 mismatch
10. Admin routes: move-new-to-old-hot-log, empty-old-hot-log work

---

## 8. Phase 4 — Testing & Cross-Validation

### 8.1 Test Directory

```
test/
├── CMakeLists.txt
├── TestGlobals.cpp          # Constant values, enum values
├── TestEntry.cpp            # Round-trip all entry types
├── TestLogId.cpp            # Random generation, base64, dir prefix
├── TestLogIndex.cpp         # Entry triplet arithmetic
├── TestLogConfig.cpp        # JSON validation
├── TestPersistedLog.cpp     # File I/O, checkpoint scan
├── TestServer.cpp           # Full server integration
└── TestRoundTrip.cpp        # Binary equivalence vs Node.js
```

### 8.2 Unit Test Categories

#### Globals Tests (`TestGlobals.cpp`)

- All constant values match TS `globals.ts`
- Enum values match (`CommandName`, `EntryType`, `IOOperationType`)
- Prefix byte lengths match TS

#### Entry Round-Trip Tests (`TestEntry.cpp`)

For every entry type:
- Construct → `u8()` → `fromU8()` → `u8()` compares byte-for-byte
- Construct → `byteLength()` matches expected
- CRC32 matches known vector
- `verify()` returns true/false correctly
- Partial deserialization: `fromPartialU8()` with truncated buffer returns `needBytes`
- Invalid type byte: `fromU8()` throws/returns error

#### LogId Tests (`TestLogId.cpp`)

- `newRandom()` produces 16 bytes
- `base64()` round-trips through `fromBase64()`
- `base64()` matches Node.js `Buffer.toString("base64url")`
- `logDirPrefix()` returns `"XX/YY"` format
- `base64()` caching (memoization)

#### LogIndex Tests (`TestLogIndex.cpp`)

- `addEntry()` stores correct triplets
- `entry()` arithmetic lookup matches
- `entry(entryNum)` throws for out-of-range
- `entryCount()` returns correct count
- `byteLength()` with prefix length matches
- `appendIndex()` merges correctly
- `lastConfig()` returns most recent config entry
- `hasConfig()` / `hasEntries()` boolean logic
- Config tracking: `CreateLogCommand` and `SetConfigCommand` update `lcNum`

#### LogConfig Tests (`TestLogConfig.cpp`)

- Valid JSON → `LogConfig` instance
- Missing required fields → error
- `authType` validation
- `setDefaults()` generates missing tokens
- `ProtectedProperties` filtering
- JSON serialization round-trip

#### PersistedLog Tests (`TestPersistedLog.cpp`)

- Write entries → read back, content matches
- Checkpoint insertion at interval boundaries
- Straddling entry recovery
- `init()` from existing file rebuilds index
- `truncate()` safe recovery
- IO block/unblock semantics
- CRC verification failure → error

#### Server Integration Tests (`TestServer.cpp`)

- Start server, exercise REST API
- Create log → verify on disk
- Append entries → verify head and entries
- Config round-trip
- Admin routes
- Shutdown + restart → verify recovery

### 8.3 Binary Equivalence Test (`TestRoundTrip.cpp`)

Generate known test vectors:

```cpp
// Known bytes from Node.js logsrd output (captured from actual run)
const std::vector<uint8_t> EXPECTED_GLOBAL_LOG_PREFIX = {
    0x00,       // EntryType.GLOBAL_LOG
    0x12, 0x34, ...  // LogId bytes
    // ... full 27 bytes
};

TEST_CASE("GlobalLogEntry binary matches Node.js") {
    auto gle = GlobalLogEntry(/* specific args */);
    auto prefix = gle.prefixU8();
    CHECK(prefix == EXPECTED_GLOBAL_LOG_PREFIX);
}
```

### 8.4 Cross-Validation Script

#### `scripts/e2e-test.sh`

```bash
#!/bin/bash
# Start C++ server in background
./build/src/logsrdcpp &
CPP_PID=$!
sleep 1

# Run configurable load tester
node utils/simple-load-tester.mjs --iterations 10 --sleep 0

# Check for errors
if [ $? -eq 0 ]; then
    echo "E2E test PASSED"
else
    echo "E2E test FAILED"
fi

kill $CPP_PID
```

#### `scripts/generate-test-data.mjs`

Generate binary test vectors from Node.js for C++ to match:

```javascript
// Run with: node scripts/generate-test-data.mjs
// Outputs hex-encoded entry bytes that C++ tests use as expected values
const { GlobalLogEntry, LogLogEntry, /* ... */ } = require('./build/src/lib/entry/...');
// Serialize → hex → write to test/expected-data/ dir
```

### 8.5 Manual Validation Steps

```
1. Start Node.js logsrd:  npm start
2. Create log, append entries, note log files
3. Stop Node.js logsrd
4. Start C++ logsrd on same data dir: ./logsrdcpp
5. GET /log/:logid/head → should match Node.js output
6. GET /log/:logid/entries → should match Node.js output
7. xxd/hexdump key .new, .old, .log files → bytes must match
```

---

## 9. Phase 5 — Configurable Load Tester

### 9.1 Objective

Adapt `utils/simple-load-tester.mjs` to be a standalone, configurable e2e test tool that validates both Node.js and C++ server instances.

### 9.2 Usage

```bash
# Default (1000 iterations, 100ms sleep, 127.0.0.1:7000)
node utils/simple-load-tester.mjs

# Quick smoke test (10 iterations, no sleep)
node utils/simple-load-tester.mjs --iterations 10 --sleep 0

# Custom host/port
node utils/simple-load-tester.mjs --host 127.0.0.1 --port 1976

# Verbose error reporting
node utils/simple-load-tester.mjs --verbose

# Output JSON summary
node utils/simple-load-tester.mjs --json
```

### 9.3 Architecture

```
utils/simple-load-tester.mjs
    │
    ├── CLI: parse args (iterations, sleep, host, port, verbose, json)
    │
    └── For each iteration:
        ├── POST /log (create) → get logId
        ├── Loop 200 ×:
        │   ├── POST /log/:logid (append) → verify 200
        │   ├── sleep(N ms)
        │   └── GET /log/:logid/head × 10 (parallel) → verify entryNum
        └── Loop:
            └── GET /log/:logid/entries?offset=N → verify entryNums
```

### 9.4 Modified File

**`utils/simple-load-tester.mjs`** — add:

```javascript
import { parseArgs } from 'node:util';

const {
    values: {
        iterations = 1000,
        sleep = 100,
        host = '127.0.0.1',
        port = '7000',
        verbose = false,
        json = false,
    }
} = parseArgs({
    options: {
        iterations: { type: 'string', short: 'n' },
        sleep: { type: 'string', short: 's' },
        host: { type: 'string', short: 'h' },
        port: { type: 'string', short: 'p' },
        verbose: { type: 'boolean', short: 'v' },
        json: { type: 'boolean', short: 'j' },
    }
});

const BASE_URL = `http://${host}:${port}`;
// ... rest of logic uses BASE_URL and configurable parameters
```

---

## 10. Future Work (Post-MVP)

### 10.1 Auth (Token + JWT)

- `src/log/Access.h/.cpp`
- Token matching: superToken → full access, readToken/writeToken/adminToken per operation
- JWT verification via HS256 (hand-written HMAC-SHA256 or `jwt-cpp`)
- Access check in every route handler

### 10.2 WebSocket Replication

- `src/replicate/Replicate.h/.cpp`
- `src/replicate/Host.h/.cpp` — uWS client WebSocket
- `src/replicate/AppendReplica.h`
- WS upgrade handler: `app.ws<PerSocketData>("/replicate", {...})`
- Binary send/receive of GlobalLogEntry bytes
- Reconnect logic with timeout

### 10.3 WebSocket Pub/Sub

- `src/Subscribe.h/.cpp`
- WS upgrade handler: `app.ws<PerSocketData>("/client", {...})`
- Sub/unsub protocol: `sub:<base64>:<token>` / `unsub:<base64>`
- Publish via `app.publish(topic, message, OpCode)`
- Subscription lifecycle callbacks

### 10.4 Multi-Threaded I/O

- Thread pool for blocking I/O operations
- uWS async wrapper: submit I/O work, fire callback on completion
- Configurable thread count

### 10.5 ReadRangeIOOperation

- Implement `_processReadRangeOp` (currently throws "not implemented" in both TS and C++ MVP)
- Range-based byte reads from log files

### 10.6 Performance Optimization

- Benchmark vs Node.js
- Profile with `perf`
- SIMD CRC32 (SSE4.2/ARM CRC instructions)
- Zero-copy buffer management
- Write coalescing optimization

---

## 11. Implementation Checklist

### Phase 1 — Foundation & Binary Format

- [ ] `CMakeLists.txt` — project root
- [ ] `src/CMakeLists.txt` — build source files
- [ ] `src/Globals.h` — all constants and enums
- [ ] `src/entry/LogEntry.h` — abstract base
- [ ] `src/entry/GlobalLogEntry.h/.cpp` — 27-byte prefix
- [ ] `src/entry/LogLogEntry.h/.cpp` — 11-byte prefix
- [ ] `src/entry/JSONLogEntry.h/.cpp`
- [ ] `src/entry/BinaryLogEntry.h/.cpp`
- [ ] `src/entry/CommandLogEntry.h/.cpp`
- [ ] `src/entry/GlobalLogCheckpoint.h/.cpp` — 9-byte
- [ ] `src/entry/LogLogCheckpoint.h/.cpp` — 13-byte
- [ ] `src/entry/EntryFactory.h/.cpp` — dispatch
- [ ] `src/entry/command/JSONCommandType.h/.cpp`
- [ ] `src/entry/command/CreateLogCommand.h`
- [ ] `src/entry/command/SetConfigCommand.h`
- [ ] `src/log/LogId.h/.cpp` — 16-byte ID, base64
- [ ] `src/log/LogIndex.h/.cpp` — entry triplets
- [ ] `src/log/GlobalLogIndex.h`
- [ ] `src/log/LogLogIndex.h`
- [ ] `src/log/LogHost.h`
- [ ] `src/log/LogAddress.h/.cpp`
- [ ] CRC32 utility (zlib wrapper)
- [ ] base64url utility (OpenSSL)
- [ ] `test/CMakeLists.txt`
- [ ] `test/TestGlobals.cpp`
- [ ] `test/TestEntry.cpp` — round-trip all types
- [ ] `test/TestLogId.cpp`
- [ ] `test/TestLogIndex.cpp`
- [ ] Verify binary equivalence against Node.js hex dumps

### Phase 2 — Persistence Layer

- [ ] `src/persist/io/IOOperation.h`
- [ ] `src/persist/io/IOQueue.h/.cpp`
- [ ] `src/persist/io/GlobalLogIOQueue.h/.cpp`
- [ ] `src/persist/io/WriteIOOperation.h`
- [ ] `src/persist/io/ReadEntryIOOperation.h`
- [ ] `src/persist/io/ReadEntriesIOOperation.h`
- [ ] `src/persist/PersistedLog.h/.cpp` — FH pool, init, checkpoint scan
- [ ] `src/persist/HotLog.h/.cpp` — write + checkpoint interleaving
- [ ] `src/persist/LogLog.h/.cpp` — per-log persistence
- [ ] `src/persist/Persist.h/.cpp` — lifecycle coordinator
- [ ] `test/TestPersistedLog.cpp`
- [ ] Verify checkpoint alignment at 128KB boundaries
- [ ] Verify init() recovers from existing files
- [ ] Verify moveNewToOldHotLog / emptyOldHotLog

### Phase 3 — Log Abstraction & HTTP Server

- [ ] `src/log/LogConfig.h/.cpp` — simdjson validation
- [ ] `src/log/LogStats.h/.cpp`
- [ ] `src/log/AppendQueue.h/.cpp` — write pipeline
- [ ] `src/log/Log.h/.cpp` — aggregate root
- [ ] `src/Server.h/.cpp` — orchestrator
- [ ] `src/main.cpp` — entry point + uWS routes
- [ ] POST /log handler
- [ ] POST /log/:logid handler
- [ ] GET /log/:logid/config handler
- [ ] PATCH /log/:logid/config handler
- [ ] GET /log/:logid/head handler
- [ ] GET /log/:logid/entries handler
- [ ] GET /version handler
- [ ] GET /admin/* handlers
- [ ] Catch-all 404 handler
- [ ] `test/TestLogConfig.cpp`
- [ ] `test/TestServer.cpp`
- [ ] Smoke test: curl all endpoints

### Phase 4 — Testing & Cross-Validation

- [ ] `test/TestRoundTrip.cpp` — binary equivalence
- [ ] `scripts/e2e-test.sh` — automated e2e
- [ ] `scripts/generate-test-data.mjs` — test vector generator
- [ ] Node.js vs C++ cross-validation
- [ ] File byte-level comparison
- [ ] Recovery test: write → kill → restart → read
- [ ] Edge case: empty file, oversized entry, corrupt data

### Phase 5 — Configurable Load Tester

- [ ] CLI arg parsing in `utils/simple-load-tester.mjs`
- [ ] `--iterations` flag
- [ ] `--sleep` flag
- [ ] `--host` / `--port` flags
- [ ] `--verbose` output
- [ ] `--json` summary output
- [ ] Remove undici `Pool` (use per-request `request()`)
- [ ] Test: 0/10/100/1000 iterations

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| µWebSockets build fails (missing uSockets submodule) | Medium | High | Check `external/uWebSockets/.gitmodules`. Run `git submodule update --init --recursive` in uWebSockets dir. |
| zlib CRC32 does not match `@node-rs/crc32` | Low | High | Verify known vector: `crc32("hello")` in Node.js → `crc32(0, "hello", 5)` in C. If mismatch, adjust polynomial or use software CRC32. |
| simdjson schema validation differs from AJV | Low | Medium | simdjson is schema-less. Write explicit validation matching AJV's `LogConfigSchema`. |
| µWebSockets POST body reading is awkward | Low | Medium | Wrap uWS `onData`/`onAborted` in a reusable helper function. Used by all POST/PATCH handlers. |
| OpenSSL base64 produces different output than Node.js | Low | Medium | Match Node.js `Buffer.from().toString("base64url")`: `BIO_f_base64` → remove `\n` → replace `+/` with `-_` → strip `=`. |
| Port conflicts in e2e tests | Low | Low | Use dynamic port assignment or random port in e2e script. |
| Large context window overflow for this plan | Medium | Low | This plan is a reference document. Each session only needs to focus on the current phase. |

---

## Appendix A: Key TypeScript→C++ Idiom Mappings

| TypeScript | C++ |
|------------|-----|
| `class Foo { method() }` | `class Foo { void method(); }` |
| `Promise<T>` / `async/await` | Synchronous call or callback |
| `buffer: Uint8Array` | `std::span<const uint8_t>` or `std::vector<uint8_t>` |
| `buffer.slice(offset, length)` | `buffer.subspan(offset, length)` |
| `Map<K, V>` | `std::unordered_map<K, V>` |
| `Set<T>` | `std::unordered_set<T>` |
| `string` | `std::string` |
| `string | null` | `std::optional<std::string>` |
| `number` (u32) | `uint32_t` |
| `number` (i16) | `int16_t` |
| `throw Error("msg")` | `return std::unexpected("msg")` |
| `instanceof` | `dynamic_cast` or `type()` enum |
| `const enum Foo { A, B }` | `enum class Foo : uint8_t { A, B }` |
| `Array<T>` | `std::vector<T>` |
| `T | null` | `std::optional<T>` or raw pointer |
| `for (const x of xs)` | `for (const auto& x : xs)` |
| `import` | `#include` + `namespace logsrd` |
| `Date.now()` | `std::chrono::steady_clock::now()` |
| `crypto.randomBytes(16)` | `RAND_bytes(bytes, 16)` |
| `Buffer.from("base64url")` | OpenSSL `BIO_f_base64` + URL-safe replace |
| `JSON.stringify` / `JSON.parse` | simdjson `parser.parse()` / `serializer.to_json()` |
| `instance.value()` | `dynamic_cast<JSONCommandType*>(&entry)->value()` |

## Appendix B: Data Flow Diagram

```
Client                    Server                    Persist                   Disk
  │                         │                         │                       │
  │  POST /log/:logid       │                         │                       │
  │ ─────────────────────► │                         │                       │
  │                         │  Server.appendLog()     │                       │
  │                         │ ───────► Log.append()   │                       │
  │                         │           │             │                       │
  │                         │           ▼             │                       │
  │                         │     AppendQueue         │                       │
  │                         │     .enqueue()          │                       │
  │                         │           │             │                       │
  │                         │           ▼             │                       │
  │                         │     WriteIOOperation    │                       │
  │                         │     → Persist           │                       │
  │                         │ ───────────────────►   │                       │
  │                         │                         │ HotLog.enqueueOp()   │
  │                         │                         │ ─────────────►       │
  │                         │                         │   writev()           │
  │                         │                         │ ──────────────────► │
  │                         │                         │   datasync()          │
  │                         │                         │ ──────────────────► │
  │                         │                         │   ← bytesWritten     │
  │                         │                         │ ◄────────────────── │
  │                         │                         │   addEntryToIndex()   │
  │                         │                         │   stats.addOp()       │
  │                         │                         │                       │
  │                         │  ← {entryNum, crc}      │                       │
  │                         │ ◄───────────────────   │                       │
  │  ← 200 {entryNum, crc}  │                         │                       │
  │ ◄────────────────────── │                         │                       │
```

## Appendix C: Error Codes

| HTTP Status | Error String | Condition |
|-------------|-------------|-----------|
| 400 | `"Invalid JSON"` | POST body is not valid JSON |
| 400 | `"Max post size ${MAX_ENTRY_SIZE} bytes exceeded"` | POST body too large |
| 400 | `"Invalid lastEntryNum"` | `lastEntryNum` query param is not a number |
| 400 | `"Invalid lastConfigNum"` | `lastConfigNum` query param is not a number |
| 400 | `"Invalid lastEntryNum"` | `lastEntryNum` != last entry in index |
| 404 | `"Invalid log id"` | logId not found or not valid base64 |
| 404 | `"Not found"` | Catch-all 404 |
| 409 | `"lastEntryNum mismatch"` | OCC check fails on append |
| 409 | `"lastConfigNum mismatch"` | OCC check fails on setConfig |

---

*This plan was generated from analysis of the TypeScript logsrd source code, spec tree, and the µWebSockets C++ library. Each phase is designed to produce a working, testable increment that builds on the previous phase.*
