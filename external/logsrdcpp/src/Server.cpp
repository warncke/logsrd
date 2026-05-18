#include "Server.h"
#include "entry/JSONLogEntry.h"
#include "entry/BinaryLogEntry.h"
#include "entry/command/CreateLogCommand.h"
#include <sstream>

namespace logsrd {

Server::Server(ServerConfig config)
    : config_(std::move(config))
{}

Server::~Server() = default;

void Server::init() {
    persist_ = std::make_unique<Persist>(config_.dataDir, config_.hotLogFileName);

    // Wire up index callbacks so Persist can notify Server when entries are scanned
    persist_->onIndexEntry = [this](uint32_t entryNum, uint32_t offset,
                                     uint32_t length, bool isNew, bool isConfig) {
        // Find which log this entry belongs to and update its index
        // For init, logs aren't registered yet — this is handled by Log during its own init
    };

    persist_->init();
}

std::expected<std::unique_ptr<LogEntry>, std::string> Server::createLog(const std::string& configJson) {
    // Parse config
    auto configResult = LogConfig::newFromJSON(configJson);
    if (!configResult) return std::unexpected(configResult.error());

    auto cfg = std::move(*configResult);

    // Generate log ID
    auto logId = LogId::newRandom();
    cfg.config().logId = logId.base64();
    cfg.setDefaults();

    // Create log instance
    auto log = std::make_unique<Log>(logId, cfg, config_.dataDir);
    auto* logPtr = log.get();

    // Register with server
    logs_[logId.base64()] = std::move(log);

    // Create first entry (CreateLogCommand)
    auto createResult = logPtr->create(&cfg);
    if (!createResult) {
        logs_.erase(logId.base64());
        return std::unexpected(createResult.error());
    }

    return std::unique_ptr<LogEntry>();
}

std::expected<AppendResult, std::string> Server::appendLog(
    const std::string& logIdBase64, std::span<const uint8_t> data,
    std::optional<uint32_t> lastEntryNum) {
    auto* log = getLog(logIdBase64);
    if (!log) return std::unexpected("Invalid log id");
    if (log->stopped()) return std::unexpected("Log is stopped");

    // Determine entry type from config
    std::unique_ptr<LogEntry> inner;
    if (log->config().config().type == "json") {
        inner = std::make_unique<JSONLogEntry>(std::vector<uint8_t>(data.begin(), data.end()));
    } else {
        inner = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>(data.begin(), data.end()));
    }

    // Wrap in GlobalLogEntry and append
    auto result = log->append(std::move(inner));
    return result;
}

std::expected<std::string, std::string> Server::getConfigJSON(const std::string& logIdBase64, bool meta) {
    auto* log = getLog(logIdBase64);
    if (!log) return std::unexpected("Invalid log id");

    auto json = log->config().toJSON(meta);
    if (meta) {
        std::ostringstream os;
        os << "{\"entryNum\":0,\"crc\":0,\"entry\":" << json << "}";
        return os.str();
    }
    return json;
}

std::expected<AppendResult, std::string> Server::setConfig(
    const std::string& logIdBase64, std::string_view json, uint32_t lastConfigNum) {
    auto* log = getLog(logIdBase64);
    if (!log) return std::unexpected("Invalid log id");

    return log->setConfig(json, lastConfigNum, persist_.get());
}

std::expected<std::string, std::string> Server::getHeadJSON(const std::string& logIdBase64) {
    auto* log = getLog(logIdBase64);
    if (!log) return std::unexpected("Invalid log id");

    auto result = log->getHead(persist_.get());
    if (!result) return std::unexpected(result.error());

    return "{}"; // placeholder
}

std::expected<std::string, std::string> Server::getEntriesJSON(
    const std::string& logIdBase64, std::optional<uint32_t> offset,
    std::optional<uint32_t> limit, std::optional<std::vector<uint32_t>> entryNums) {
    auto* log = getLog(logIdBase64);
    if (!log) return std::unexpected("Invalid log id");

    if (entryNums) {
        auto result = log->getEntryNums(*entryNums, persist_.get());
        if (!result) return std::unexpected(result.error());
        return "[{}]"; // placeholder
    }

    auto result = log->getEntries(offset.value_or(0), limit.value_or(MAX_RESPONSE_ENTRIES), persist_.get());
    if (!result) return std::unexpected(result.error());
    return "[{}]"; // placeholder
}

Log* Server::getLog(const std::string& logIdBase64) {
    auto it = logs_.find(logIdBase64);
    return it == logs_.end() ? nullptr : it->second.get();
}

void Server::delLog(const std::string& logIdBase64) {
    logs_.erase(logIdBase64);
}

} // namespace logsrd
