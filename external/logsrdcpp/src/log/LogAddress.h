#pragma once
#include <string>
#include <vector>
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
