#include "LogAddress.h"
#include <sstream>

namespace logsrd {

LogAddress LogAddress::fromString(std::string_view s) {
    if (s.size() < 22) {
        throw std::runtime_error("Invalid LogAddress: too short");
    }

    LogAddress addr;
    std::vector<std::string> parts;
    size_t start = 0;
    while (true) {
        auto pos = s.find(';', start);
        if (pos == std::string_view::npos) {
            parts.emplace_back(s.substr(start));
            break;
        }
        parts.emplace_back(s.substr(start, pos - start));
        start = pos + 1;
    }

    if (!parts.empty()) {
        addr.logIdBase64 = parts[0];
    }
    if (parts.size() >= 2) {
        addr.host = LogHost::fromString(parts[1]);
    }
    for (size_t i = 2; i < parts.size(); i++) {
        addr.config.push_back(LogHost::fromString(parts[i]));
    }

    return addr;
}

std::string LogAddress::toString() const {
    std::string result = logIdBase64;
    if (host.has_value()) {
        result += ";" + host->toString();
    }
    for (const auto& c : config) {
        result += ";" + c.toString();
    }
    return result;
}

} // namespace logsrd
