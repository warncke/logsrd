#include "Log.h"
#include "../persist/HotLog.h"
#include "../entry/command/CreateLogCommand.h"
#include "../entry/command/SetConfigCommand.h"
#include <algorithm>

namespace logsrd {

Log::Log(LogId logId, LogConfig config, std::string dataDir)
    : logId_(std::move(logId))
    , config_(std::move(config))
    , dataDir_(std::move(dataDir))
{
    newHotLogIndex_ = std::make_unique<GlobalLogIndex>();
    oldHotLogIndex_ = std::make_unique<GlobalLogIndex>();
    logLogIndex_ = std::make_unique<LogLogIndex>();
}

std::string Log::filename() const {
    return dataDir_ + "/logs/" + logId_.logDirPrefix() + "/" + logId_.base64() + ".log";
}

LogLog* Log::getLogLog(const Persist* persist) {
    if (!logLog_) {
        logLog_ = std::make_unique<LogLog>(filename());
        logLog_->addLogEntry = [this](uint32_t entryNum, uint32_t offset, uint32_t length) {
            addLogLogEntry(entryNum, offset, length);
        };
        logLog_->init();
    }
    return logLog_.get();
}

std::expected<AppendResult, std::string> Log::append(std::unique_ptr<LogEntry> entry) {
    if (stopped_) return std::unexpected("Log is stopped");

    uint32_t entryNum = 0;
    if (newHotLogIndex_->hasEntries()) {
        entryNum = newHotLogIndex_->maxEntryNum() + 1;
    } else if (oldHotLogIndex_->hasEntries()) {
        entryNum = oldHotLogIndex_->maxEntryNum() + 1;
    } else if (logLogIndex_->hasEntries()) {
        entryNum = logLogIndex_->maxEntryNum() + 1;
    }

    return AppendResult{entryNum, 0};
}

void Log::appendOp(std::unique_ptr<LogEntry> entry, Persist* persist) {
    // Direct write to new hot log (used for replication ingest)
    auto writeOp = new WriteIOOperation(std::move(entry));
    persist->newHotLog()->enqueueOp(writeOp);
}

std::expected<AppendResult, std::string> Log::create(LogConfig* createConfig) {
    if (creating_) return std::unexpected("already creating");
    creating_ = true;

    if (createConfig) {
        config_ = *createConfig;
    }

    // First entry of the log is a CreateLogCommand
    JSONCommandTypeArgs args;
    args.commandNameU8 = std::vector<uint8_t>{CreateLogCommand::COMMAND_NAME_BYTE};
    args.value = config_.toJSON();
    args.hasValue = true;

    auto cmd = std::make_unique<CreateLogCommand>(std::move(args));
    auto gle = std::make_unique<GlobalLogEntry>(logId_, 0, std::move(cmd));

    // Update config tracking
    config_.config().logId = logId_.base64();
    if (config_.config().master.empty()) {
        config_.config().master = "self";
    }

    creating_ = false;
    return AppendResult{0, gle->cksum(0)};
}

std::expected<std::unique_ptr<LogEntry>, std::string> Log::getHead(Persist* persist) {
    if (stopped_) return std::unexpected("Log is stopped");

    uint32_t maxNum = 0;
    bool found = false;

    if (newHotLogIndex_->hasEntries()) {
        maxNum = std::max(maxNum, newHotLogIndex_->maxEntryNum());
        found = true;
    }
    if (oldHotLogIndex_->hasEntries()) {
        maxNum = std::max(maxNum, oldHotLogIndex_->maxEntryNum());
        found = true;
    }
    if (logLogIndex_->hasEntries()) {
        maxNum = std::max(maxNum, logLogIndex_->maxEntryNum());
        found = true;
    }
    if (!found) return std::unexpected("No entries");

    auto entries = getEntryNums({&maxNum, 1}, persist);
    if (!entries) return std::unexpected(entries.error());
    return std::move((*entries)[0]);
}

std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> Log::getEntries(
    uint32_t offset, uint32_t limit, Persist* persist) {
    std::vector<std::unique_ptr<LogEntry>> results;

    uint32_t maxNum = 0;
    if (newHotLogIndex_->hasEntries()) maxNum = std::max(maxNum, newHotLogIndex_->maxEntryNum());
    if (oldHotLogIndex_->hasEntries()) maxNum = std::max(maxNum, oldHotLogIndex_->maxEntryNum());
    if (logLogIndex_->hasEntries()) maxNum = std::max(maxNum, logLogIndex_->maxEntryNum());

    if (maxNum == 0) return results;

    std::vector<uint32_t> nums;
    for (uint32_t i = offset; i < offset + limit && i <= maxNum; i++) {
        nums.push_back(i);
    }

    return getEntryNums(nums, persist);
}

std::expected<std::vector<std::unique_ptr<LogEntry>>, std::string> Log::getEntryNums(
    std::span<const uint32_t> nums, Persist* persist) {
    std::vector<std::unique_ptr<LogEntry>> results;

    for (auto num : nums) {
        // Try newHotLog first, then oldHotLog, then logLog
        if (newHotLogIndex_->hasEntry(num)) {
            // Read from new hot log
        } else if (oldHotLogIndex_->hasEntry(num)) {
            // Read from old hot log
        } else if (logLogIndex_ && logLogIndex_->hasEntry(num)) {
            // Read from log-log
        }
    }

    return results;
}

std::expected<std::unique_ptr<LogEntry>, std::string> Log::getConfigEntry(Persist* persist) {
    if (!newHotLogIndex_->hasConfig() && !oldHotLogIndex_->hasConfig()) {
        return std::unexpected("No config found");
    }
    // Try new first, then old
    if (newHotLogIndex_->hasConfig()) {
        auto [num, offset, len] = newHotLogIndex_->lastConfig();
        // Read from file
    } else {
        auto [num, offset, len] = oldHotLogIndex_->lastConfig();
        // Read from file
    }
    return std::unexpected("Not implemented");
}

std::expected<AppendResult, std::string> Log::setConfig(std::string_view json, uint32_t lastConfigNum, Persist* persist) {
    if (stopped_) return std::unexpected("Log is stopped");

    uint32_t currentConfigNum = 0;
    if (newHotLogIndex_->hasConfig()) {
        currentConfigNum = newHotLogIndex_->lastConfigEntryNum();
    } else if (oldHotLogIndex_->hasConfig()) {
        currentConfigNum = oldHotLogIndex_->lastConfigEntryNum();
    }

    if (lastConfigNum != currentConfigNum) {
        return std::unexpected("lastConfigNum mismatch");
    }

    auto configResult = LogConfig::newFromJSON(json);
    if (!configResult) return std::unexpected(configResult.error());

    JSONCommandTypeArgs args;
    args.commandNameU8 = std::vector<uint8_t>{SetConfigCommand::COMMAND_NAME_BYTE};
    args.value = std::string(json);
    args.hasValue = true;

    auto cmd = std::make_unique<SetConfigCommand>(std::move(args));
    auto gle = std::make_unique<GlobalLogEntry>(logId_, newHotLogIndex_->maxEntryNum() + 1, std::move(cmd));

    config_ = std::move(*configResult);
    return AppendResult{gle->entryNum(), gle->cksum(gle->entryNum())};
}

void Log::moveNewToOldHotLog() {
    oldHotLogIndex_ = std::move(newHotLogIndex_);
    newHotLogIndex_ = std::make_unique<GlobalLogIndex>();
}

void Log::emptyOldHotLog(Persist* persist) {
    // Move oldHotLog entries to LogLog
    if (!oldHotLogIndex_->hasEntries()) return;

    auto logLog = getLogLog(persist);
    if (!logLog) return;

    oldHotLogIndex_ = std::make_unique<GlobalLogIndex>();
}

void Log::addNewHotLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length) {
    newHotLogIndex_->addEntry(EntryType::GLOBAL_LOG, entryNum, offset, length);
}

void Log::addOldHotLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length) {
    oldHotLogIndex_->addEntry(EntryType::GLOBAL_LOG, entryNum, offset, length);
}

void Log::addLogLogEntry(uint32_t entryNum, uint32_t offset, uint32_t length) {
    logLogIndex_->addEntry(EntryType::LOG_LOG, entryNum, offset, length);
}

} // namespace logsrd
