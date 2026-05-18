#pragma once
#include "LogEntry.h"
#include <memory>
#include <span>

namespace logsrd {

struct EntryFactory {
    // Deserialize a complete entry from a buffer that contains every byte
    static std::unique_ptr<LogEntry> fromU8(std::span<const uint8_t> data);

    // Partial deserialize — never throws, returns needBytes or err
    static PartialResult fromPartialU8(std::span<const uint8_t> data);
};

} // namespace logsrd
