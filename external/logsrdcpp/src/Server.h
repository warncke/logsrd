#pragma once
#include <memory>
#include <string>
#include <unordered_map>
#include <expected>
#include "log/Log.h"
#include "log/LogId.h"
#include "persist/Persist.h"
#include "entry/LogEntry.h"
#include "Globals.h"

namespace logsrd {

class Server {
public:
    struct ServerConfig {
        std::string host = "127.0.0.1:1976";
        std::string dataDir = "./data";
        size_t globalIndexCountLimit = GLOBAL_INDEX_COUNT_LIMIT;
        std::string hotLogFileName{DEFAULT_HOT_LOG_FILE_NAME};
    };

private:
    ServerConfig config_;
    std::unique_ptr<Persist> persist_;
    std::unordered_map<std::string, std::unique_ptr<Log>> logs_;

public:
    explicit Server(ServerConfig config);
    ~Server();

    void init();
    Persist* persist() const { return persist_.get(); }

    // Public API
    std::expected<std::unique_ptr<LogEntry>, std::string> createLog(const std::string& configJson);
    std::expected<AppendResult, std::string> appendLog(
        const std::string& logIdBase64, std::span<const uint8_t> data,
        std::optional<uint32_t> lastEntryNum = std::nullopt);
    std::expected<std::string, std::string> getConfigJSON(const std::string& logIdBase64, bool meta = false);
    std::expected<AppendResult, std::string> setConfig(
        const std::string& logIdBase64, std::string_view json, uint32_t lastConfigNum);
    std::expected<std::string, std::string> getHeadJSON(const std::string& logIdBase64);
    std::expected<std::string, std::string> getEntriesJSON(
        const std::string& logIdBase64, std::optional<uint32_t> offset,
        std::optional<uint32_t> limit, std::optional<std::vector<uint32_t>> entryNums);

    Log* getLog(const std::string& logIdBase64);
    void delLog(const std::string& logIdBase64);
};

} // namespace logsrd
