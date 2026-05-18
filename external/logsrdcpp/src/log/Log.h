#pragma once
#include <memory>
#include <string>
#include <expected>
#include <functional>
#include "LogId.h"
#include "LogConfig.h"
#include "LogIndex.h"
#include "LogStats.h"
#include "AppendQueue.h"
#include "../persist/Persist.h"
#include "../persist/LogLog.h"
#include "../entry/LogEntry.h"
#include "../entry/GlobalLogEntry.h"
#include "../Globals.h"

namespace logsrd {

class Server;

class Log {
    LogId logId_;
    LogConfig config_;
    LogStats stats_;
    std::string dataDir_;

    // Three-tier index
    std::unique_ptr<GlobalLogIndex> newHotLogIndex_;
    std::unique_ptr<GlobalLogIndex> oldHotLogIndex_;
    std::unique_ptr<LogLogIndex> logLogIndex_;

    // Per-log persistence (lazy init)
    std::unique_ptr<LogLog> logLog_;

    // Append serialization
    std::unique_ptr<AppendQueue> appendQueue_;
    std::unique_ptr<AppendQueue> appendInProgress_;
    bool creating_{false};
    bool stopped_{false};

public:
    Log(LogId logId, LogConfig config, std::string dataDir);
    ~Log() = default;

    const LogId& logId() const { return logId_; }
    LogConfig& config() { return config_; }
    const LogConfig& config() const { return config_; }
    LogStats& stats() { return stats_; }
    bool stopped() const { return stopped_; }
    void stop() { stopped_ = true; }

    // Lazy-init LogLog
    LogLog* getLogLog(const Persist* persist);

    // File path for per-log storage
    std::string filename() const;

    // Append operations
    std::expected<AppendResult, std::string> append(std::unique_ptr<LogEntry> entry);
    void appendOp(std::unique_ptr<LogEntry> entry, Persist* persist);
    std::expected<AppendResult, std::string> create(LogConfig* createConfig);

    // Read operations
    std::expected<std::unique_ptr<LogEntry>, std::string> getHead(Persist* persist);
    std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> getEntries(
        uint32_t offset, uint32_t limit, Persist* persist);
    std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> getEntryNums(
        std::span<const uint32_t> nums, Persist* persist);

    // Config operations
    std::expected<std::unique_ptr<LogEntry>, std::string> getConfigEntry(Persist* persist);
    std::expected<AppendResult, std::string> setConfig(std::string_view json, uint32_t lastConfigNum, Persist* persist);

    // Rotation helpers
    void moveNewToOldHotLog();
    void emptyOldHotLog(Persist* persist);

    // Index access (for HotLog callback)
    GlobalLogIndex* newHotLogIndex() const { return newHotLogIndex_.get(); }
    GlobalLogIndex* oldHotLogIndex() const { return oldHotLogIndex_.get(); }
    LogLogIndex* getLogLogIndex() const { return logLogIndex_.get(); }

    // Called by Persist/HotLog when entries are indexed during init
    void addNewHotLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length);
    void addOldHotLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length);
    void addLogLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length);
};

} // namespace logsrd
