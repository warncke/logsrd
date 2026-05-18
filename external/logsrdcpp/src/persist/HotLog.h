#pragma once
#include "PersistedLog.h"
#include <functional>

namespace logsrd {

class HotLog : public PersistedLog {
public:
    static constexpr size_t MAX_READ_FDS = 16;
    bool isNew;

    using AddToIndexFn = std::function<void(uint32_t entryNum, uint32_t offset, uint32_t length, bool isNew)>;
    AddToIndexFn addToIndex;

    HotLog(const std::string& dataDir, const std::string& fileName, bool isNew);
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
