#pragma once
#include <memory>
#include <vector>
#include <functional>
#include <expected>
#include "../entry/GlobalLogEntry.h"
#include "../persist/Persist.h"

namespace logsrd {

struct AppendResult {
    uint32_t entryNum;
    uint32_t crc;
};

class Log;

// Simplified append queue for MVP: serializes writes, then completes
class AppendQueue {
public:
    struct Entry {
        std::unique_ptr<GlobalLogEntry> globalEntry;
    };

    using DoneCallback = std::function<void(std::expected<AppendResult, std::string>)>;

private:
    std::vector<Entry> entries_;
    DoneCallback doneCallback_;

public:
    AppendQueue() = default;

    void enqueue(std::unique_ptr<GlobalLogEntry> entry, DoneCallback callback = nullptr);
    void process(class Log& log, Persist* persist);
};

} // namespace logsrd
