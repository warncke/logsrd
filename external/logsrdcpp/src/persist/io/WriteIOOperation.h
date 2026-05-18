#pragma once
#include "IOOperation.h"
#include "../../entry/LogEntry.h"
#include <memory>

namespace logsrd {

class WriteIOOperation : public IOOperation {
public:
    std::unique_ptr<LogEntry> entry;
    uint32_t entryNum{0};
    size_t bytesWritten{0};

    WriteIOOperation(std::unique_ptr<LogEntry> entry,
                     CompleteCallback onComplete = nullptr,
                     CompleteCallback onError = nullptr)
        : IOOperation(IOOperationType::WRITE, std::move(onComplete), std::move(onError))
        , entry(std::move(entry))
    {}
};

} // namespace logsrd
