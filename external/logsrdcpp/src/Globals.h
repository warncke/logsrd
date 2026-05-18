#pragma once
#include <cstdint>
#include <string_view>
#include <array>

namespace logsrd {

// ── Constants ─────────────────────────────────────────────────
inline constexpr size_t GLOBAL_LOG_PREFIX_BYTE_LENGTH = 27;
inline constexpr size_t LOG_LOG_PREFIX_BYTE_LENGTH = 11;
inline constexpr size_t GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH = 9;
inline constexpr size_t LOG_LOG_CHECKPOINT_BYTE_LENGTH = 13;
inline constexpr size_t GLOBAL_LOG_CHECKPOINT_INTERVAL = 131072;
inline constexpr size_t LOG_LOG_CHECKPOINT_INTERVAL = 131072;
inline constexpr size_t GLOBAL_INDEX_COUNT_LIMIT = 100000;
inline constexpr size_t MAX_ENTRY_SIZE = 32768;
inline constexpr size_t MAX_LOG_SIZE = 16777216;
inline constexpr size_t MAX_RESPONSE_ENTRIES = 100;
inline constexpr std::string_view DEFAULT_HOT_LOG_FILE_NAME = "global-hot.log";

// ── Enums ─────────────────────────────────────────────────────
enum class EntryType : uint8_t {
    GLOBAL_LOG = 0,
    LOG_LOG = 1,
    GLOBAL_LOG_CHECKPOINT = 2,
    LOG_LOG_CHECKPOINT = 3,
    COMMAND = 4,
    BINARY = 5,
    JSON = 6,
};

enum class CommandName : uint8_t {
    CREATE_LOG = 0,
    SET_CONFIG = 1,
};

enum class IOOperationType : uint8_t {
    READ_ENTRY = 0,
    READ_ENTRIES = 1,
    READ_RANGE = 2,
    WRITE = 3,
};

// ── Type byte arrays ──────────────────────────────────────────
inline constexpr uint8_t TYPE_BYTE_GLOBAL_LOG = 0x00;
inline constexpr uint8_t TYPE_BYTE_LOG_LOG = 0x01;
inline constexpr uint8_t TYPE_BYTE_GLOBAL_LOG_CHECKPOINT = 0x02;
inline constexpr uint8_t TYPE_BYTE_LOG_LOG_CHECKPOINT = 0x03;
inline constexpr uint8_t TYPE_BYTE_COMMAND = 0x04;
inline constexpr uint8_t TYPE_BYTE_BINARY = 0x05;
inline constexpr uint8_t TYPE_BYTE_JSON = 0x06;

// ── Protected properties (fields stripped from config JSON) ───
inline constexpr std::array<std::string_view, 7> PROTECTED_PROPERTIES = {{
    "accessToken", "adminToken", "readToken", "writeToken", "superToken",
    "jwtProperties", "jwtSecret"
}};

} // namespace logsrd
