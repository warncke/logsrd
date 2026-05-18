#pragma once
#include <string>
#include <vector>

namespace logsrd {

struct LogHost {
    std::string master;
    std::vector<std::string> replicas;

    LogHost() = default;
    LogHost(std::string master, std::vector<std::string> replicas = {});

    static LogHost fromString(std::string_view s);
    std::string toString() const;
};

} // namespace logsrd
