#pragma once
#include <string>
#include <vector>
#include <functional>
#include "io/IOQueue.h"
#include "io/GlobalLogIOQueue.h"
#include "io/WriteIOOperation.h"
#include "io/ReadEntryIOOperation.h"
#include "io/ReadEntriesIOOperation.h"
#include "../entry/LogEntry.h"
#include "../entry/EntryFactory.h"
#include "../Globals.h"

namespace logsrd {

class PersistedLog {
protected:
    std::string logFile_;
    int writeFd_{-1};
    std::vector<int> freeReadFds_;
    std::vector<int> openReadFds_;
    size_t maxReadFds_{1};
    size_t byteLength_{0};
    bool ioBlocked_{false};

    // Queue ownership — subclass decides which to use
    IOQueue* ioQueue_{nullptr};
    GlobalLogIOQueue* globalIOQueue_{nullptr};
    bool ownsQueue_{false};

public:
    PersistedLog(std::string logFile);
    virtual ~PersistedLog();

    // Lifecycle
    virtual void init(
        EntryType entryType,
        size_t checkpointInterval,
        size_t checkpointByteLength);

    const std::string& logFile() const { return logFile_; }
    size_t byteLength() const { return byteLength_; }

    // IO control
    void blockIO();
    void unblockIO();
    void closeAllFds();

    // File handle management
    int getReadFd();
    void doneReadFd(int fd);
    void closeReadFd(int fd);
    int getWriteFd();
    void closeWriteFd();

    // Operation dispatch
    void enqueueOp(IOOperation* op, const std::string& logIdBase64 = "");
    void processOps();

    // Read/write processing — override in subclasses
    virtual void processWriteOps(std::span<IOOperation*> ops) = 0;
    virtual void processReadOps(std::span<IOOperation*> ops) = 0;

    // Checkpoint-aware read of a single entry
    virtual std::pair<std::unique_ptr<LogEntry>, size_t> processReadLogEntry(
        int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
        size_t checkpointInterval, size_t checkpointByteLength,
        EntryType entryType, size_t prefixLength) = 0;

    // Safe truncation: copy to backup, truncate
    void truncate(size_t byteLength);

    // Init helpers
    void initEntry(LogEntry* entry, uint32_t entryNum, uint32_t entryOffset, bool isConfig);

    // Called for each entry during init() scan — subclass overrides
    virtual void onInitEntry(uint32_t entryNum, uint32_t offset, uint32_t length,
                             EntryType type, bool isConfig) {}
};

} // namespace logsrd
