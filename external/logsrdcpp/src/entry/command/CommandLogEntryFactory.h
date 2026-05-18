#pragma once
#include "../CommandLogEntry.h"
#include <memory>
#include <span>

namespace logsrd {

struct CommandLogEntryFactory {
    static std::unique_ptr<CommandLogEntry> fromU8(std::span<const uint8_t> data);
};

} // namespace logsrd
