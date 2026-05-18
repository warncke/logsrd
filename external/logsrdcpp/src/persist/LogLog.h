#pragma once
#include "PersistedLog.h"

namespace logsrd {

class LogLog : public PersistedLog {
public:
    static constexpr size_t MAX_READ_FDS = 4;

    using AddLogEntryFn = std::function<void(uint32_t entryNum, uint32_t offset, uint32_t length)>;
    AddLogEntryFn addLogEntry;

    LogLog(const std::string& logFile);
    std::string logName() const;

    void processWriteOps(std::span<IOOperation*> ops) override;
    void processReadOps(std::span<IOOperation*> ops) override;

    std::pair<std::unique_ptr<LogEntry>, size_t> processReadLogEntry(
        int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
        size_t checkpointInterval, size_t checkpointByteLength,
        EntryType entryType, size_t prefixLength) override;

    void init();
    void onInitEntry(uint32_t entryNum, uint32_t offset, uint32_t length,
                     EntryType type, bool isConfig) override;
};

} // namespace logsrd
