#include "EntryFactory.h"
#include "GlobalLogEntry.h"
#include "LogLogEntry.h"
#include "JSONLogEntry.h"
#include "BinaryLogEntry.h"
#include "CommandLogEntry.h"
#include "GlobalLogCheckpoint.h"
#include "LogLogCheckpoint.h"
#include "command/CommandLogEntryFactory.h"
#include "../Globals.h"
#include "../Util.h"
#include "../log/LogId.h"
#include <stdexcept>
#include <algorithm>
#include <cstring>

namespace logsrd {

std::unique_ptr<LogEntry> EntryFactory::fromU8(std::span<const uint8_t> data) {
    if (data.empty()) {
        throw std::runtime_error("Invalid entryType: undefined");
    }

    uint8_t typeByte = data[0];

    switch (static_cast<EntryType>(typeByte)) {
    case EntryType::GLOBAL_LOG: {
        // Parse 27-byte prefix + inner entry
        if (data.size() < GLOBAL_LOG_PREFIX_BYTE_LENGTH) {
            throw std::runtime_error("Invalid u8 length");
        }
        std::array<uint8_t, 16> idArr;
        std::memcpy(idArr.data(), data.data() + 1, 16);
        LogId logId = LogId::fromBytes(std::span<const uint8_t, 16>(idArr));
        uint32_t entryNum = readU32LE(data, 17);
        // uint16_t length = readU16LE(data, 21);
        uint32_t crc = readU32LE(data, 23);
        auto inner = fromU8(data.subspan(GLOBAL_LOG_PREFIX_BYTE_LENGTH));
        return std::make_unique<GlobalLogEntry>(
            std::move(logId), entryNum, std::move(inner), crc);
    }
    case EntryType::LOG_LOG: {
        if (data.size() < LOG_LOG_PREFIX_BYTE_LENGTH) {
            throw std::runtime_error("Invalid u8 length");
        }
        uint32_t entryNum = readU32LE(data, 1);
        // uint16_t length = readU16LE(data, 5);
        uint32_t crc = readU32LE(data, 7);
        auto inner = fromU8(data.subspan(LOG_LOG_PREFIX_BYTE_LENGTH));
        return std::make_unique<LogLogEntry>(entryNum, std::move(inner), crc);
    }
    case EntryType::GLOBAL_LOG_CHECKPOINT: {
        if (data.size() < GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH) {
            throw std::runtime_error("Invalid u8 length");
        }
        int16_t offset = readI16LE(data, 1);
        uint16_t length = readU16LE(data, 3);
        uint32_t crc = readU32LE(data, 5);
        return std::make_unique<GlobalLogCheckpoint>(offset, length, crc);
    }
    case EntryType::LOG_LOG_CHECKPOINT: {
        if (data.size() < LOG_LOG_CHECKPOINT_BYTE_LENGTH) {
            throw std::runtime_error("Invalid u8 length");
        }
        int16_t offset = readI16LE(data, 1);
        uint16_t length = readU16LE(data, 3);
        uint32_t configOffset = readU32LE(data, 5);
        uint32_t crc = readU32LE(data, 9);
        return std::make_unique<LogLogCheckpoint>(offset, length, configOffset, crc);
    }
    case EntryType::COMMAND: {
        return CommandLogEntryFactory::fromU8(data);
    }
    case EntryType::JSON: {
        auto payload = std::vector<uint8_t>(data.begin() + 1, data.end());
        return std::make_unique<JSONLogEntry>(std::move(payload));
    }
    case EntryType::BINARY: {
        auto payload = std::vector<uint8_t>(data.begin() + 1, data.end());
        return std::make_unique<BinaryLogEntry>(std::move(payload));
    }
    default:
        throw std::runtime_error("Invalid entryType: " + std::to_string(typeByte));
    }
}

PartialResult EntryFactory::fromPartialU8(std::span<const uint8_t> data) {
    if (data.empty()) {
        return PartialResult{.needBytes = 1};
    }

    uint8_t typeByte = data[0];

    switch (static_cast<EntryType>(typeByte)) {
    case EntryType::GLOBAL_LOG: {
        if (data.size() < GLOBAL_LOG_PREFIX_BYTE_LENGTH) {
            return PartialResult{.needBytes = GLOBAL_LOG_PREFIX_BYTE_LENGTH - data.size()};
        }
        uint16_t entryLength = readU16LE(data, 21);
        if (entryLength > MAX_ENTRY_SIZE) {
            return PartialResult{.err = "Invalid entryLength"};
        }
        size_t totalLength = GLOBAL_LOG_PREFIX_BYTE_LENGTH + entryLength;
        if (data.size() < totalLength) {
            return PartialResult{.needBytes = totalLength - data.size()};
        }
        try {
            return PartialResult{.entry = fromU8(data)};
        } catch (const std::exception& e) {
            return PartialResult{.err = e.what()};
        }
    }
    case EntryType::LOG_LOG: {
        if (data.size() < LOG_LOG_PREFIX_BYTE_LENGTH) {
            return PartialResult{.needBytes = LOG_LOG_PREFIX_BYTE_LENGTH - data.size()};
        }
        uint16_t entryLength = readU16LE(data, 5);
        if (entryLength > MAX_ENTRY_SIZE) {
            return PartialResult{.err = "Invalid entryLength"};
        }
        size_t totalLength = LOG_LOG_PREFIX_BYTE_LENGTH + entryLength;
        if (data.size() < totalLength) {
            return PartialResult{.needBytes = totalLength - data.size()};
        }
        try {
            return PartialResult{.entry = fromU8(data)};
        } catch (const std::exception& e) {
            return PartialResult{.err = e.what()};
        }
    }
    default:
        return PartialResult{.err = "Invalid entryType: " + std::to_string(typeByte)};
    }
}

} // namespace logsrd
