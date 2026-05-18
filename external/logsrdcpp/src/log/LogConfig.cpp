#include "LogConfig.h"
#include "../Util.h"
#include "../Globals.h"
#include <sstream>
#include <algorithm>

namespace logsrd {

std::expected<LogConfig, std::string> LogConfig::newFromJSON(std::string_view json) {
    simdjson::ondemand::parser parser;
    auto padded = simdjson::padded_string(json);
    simdjson::ondemand::document doc;
    auto error = parser.iterate(padded).get(doc);
    if (error) {
        return std::unexpected("Invalid JSON: " + std::string(simdjson::error_message(error)));
    }

    ILogConfig cfg;

    // Parse required fields
    std::string_view logId;
    if (doc["logId"].get(logId) == simdjson::SUCCESS) {
        cfg.logId = std::string(logId);
    }

    std::string_view type;
    if (doc["type"].get(type) == simdjson::SUCCESS) {
        cfg.type = std::string(type);
    }

    std::string_view master;
    if (doc["master"].get(master) == simdjson::SUCCESS) {
        cfg.master = std::string(master);
    }

    std::string_view access;
    if (doc["access"].get(access) == simdjson::SUCCESS) {
        cfg.access = std::string(access);
    }

    std::string_view authType;
    if (doc["authType"].get(authType) == simdjson::SUCCESS) {
        cfg.authType = std::string(authType);
    }

    bool stopped = false;
    if (doc["stopped"].get(stopped) == simdjson::SUCCESS) {
        cfg.stopped = stopped;
    }

    // Optional token fields
    std::string_view val;
    if (doc["accessToken"].get(val) == simdjson::SUCCESS) cfg.accessToken = std::string(val);
    if (doc["adminToken"].get(val) == simdjson::SUCCESS) cfg.adminToken = std::string(val);
    if (doc["readToken"].get(val) == simdjson::SUCCESS) cfg.readToken = std::string(val);
    if (doc["writeToken"].get(val) == simdjson::SUCCESS) cfg.writeToken = std::string(val);
    if (doc["superToken"].get(val) == simdjson::SUCCESS) cfg.superToken = std::string(val);

    // Replicas
    simdjson::ondemand::array replicasArr;
    if (doc["replicas"].get(replicasArr) == simdjson::SUCCESS) {
        for (auto elem : replicasArr) {
            std::string_view r;
            if (elem.get(r) == simdjson::SUCCESS) {
                cfg.replicas.push_back(std::string(r));
            }
        }
    }

    // ConfigLogAddress
    std::string_view configLogAddr;
    if (doc["configLogAddress"].get(configLogAddr) == simdjson::SUCCESS) {
        try {
            cfg.configLogAddress = LogAddress::fromString(configLogAddr);
        } catch (...) {}
    }

    LogConfig config(std::move(cfg));
    config.setDefaults();
    return config;
}

void LogConfig::setDefaults() {
    // Generate accessToken if missing (for MVP, always generate)
    if (config_.accessToken.empty() && config_.authType == "token") {
        auto buf = randomBytes(32);
        config_.accessToken = base64urlEncode(buf);
    }
    if (config_.type.empty()) config_.type = "json";
    if (config_.access.empty()) config_.access = "public";
    if (config_.authType.empty()) config_.authType = "token";
}

std::vector<std::string> LogConfig::replicationGroup() const {
    std::vector<std::string> group;
    if (!config_.master.empty()) group.push_back(config_.master);
    group.insert(group.end(), config_.replicas.begin(), config_.replicas.end());
    return group;
}

std::string LogConfig::toJSON(bool meta) const {
    std::ostringstream os;
    os << "{";
    os << "\"logId\":\"" << config_.logId << "\"";
    os << ",\"type\":\"" << config_.type << "\"";
    os << ",\"master\":\"" << config_.master << "\"";
    os << ",\"access\":\"" << config_.access << "\"";
    os << ",\"authType\":\"" << config_.authType << "\"";
    os << ",\"stopped\":" << (config_.stopped ? "true" : "false");

    if (!config_.accessToken.empty())
        os << ",\"accessToken\":\"" << config_.accessToken << "\"";

    // Include replica info
    if (!config_.replicas.empty()) {
        os << ",\"replicas\":[";
        for (size_t i = 0; i < config_.replicas.size(); i++) {
            if (i > 0) os << ",";
            os << "\"" << config_.replicas[i] << "\"";
        }
        os << "]";
    }

    os << "}";
    return os.str();
}

} // namespace logsrd
