#include "LogHost.h"
#include <sstream>

namespace logsrd {

LogHost::LogHost(std::string master, std::vector<std::string> replicas)
    : master(std::move(master))
    , replicas(std::move(replicas))
{}

LogHost LogHost::fromString(std::string_view s) {
    std::vector<std::string> parts;
    size_t start = 0;
    while (true) {
        auto pos = s.find(',', start);
        if (pos == std::string_view::npos) {
            parts.emplace_back(s.substr(start));
            break;
        }
        parts.emplace_back(s.substr(start, pos - start));
        start = pos + 1;
    }

    LogHost host;
    if (!parts.empty()) {
        host.master = parts[0];
        for (size_t i = 1; i < parts.size(); i++) {
            host.replicas.push_back(std::move(parts[i]));
        }
    }
    return host;
}

std::string LogHost::toString() const {
    std::string result = master;
    for (const auto& r : replicas) {
        result += "," + r;
    }
    return result;
}

} // namespace logsrd
