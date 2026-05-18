#pragma once
#include <string>
#include <vector>
#include <optional>
#include <expected>
#include <simdjson.h>
#include "LogAddress.h"

namespace logsrd {

struct ILogConfig {
    std::string logId;
    std::string type;       // "binary" or "json"
    std::string master;
    std::vector<std::string> replicas;
    std::vector<std::string> asyncReplicas;
    std::string access;     // "public", "private", "readOnly", "writeOnly"
    std::string authType;   // "token" or "jwt"
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
    LogConfig() = default;
    explicit LogConfig(ILogConfig config) : config_(std::move(config)) {}

    static std::expected<LogConfig, std::string> newFromJSON(std::string_view json);
    void setDefaults();

    const ILogConfig& config() const { return config_; }
    ILogConfig& config() { return config_; }

    std::vector<std::string> replicationGroup() const;
    std::string toJSON(bool meta = false) const;
};

} // namespace logsrd
