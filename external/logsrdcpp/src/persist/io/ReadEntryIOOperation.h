#pragma once
#include "IOOperation.h"
#include "../../log/LogIndex.h"
#include "../../entry/LogEntry.h"
#include <memory>

namespace logsrd {

class ReadEntryIOOperation : public IOOperation {
public:
    LogIndex* index{nullptr};
    uint32_t entryNum{0};
    std::unique_ptr<LogEntry> resultEntry;
    size_t bytesRead{0};

    ReadEntryIOOperation(LogIndex* idx, uint32_t entryNum,
                         CompleteCallback onComplete = nullptr,
                         CompleteCallback onError = nullptr)
        : IOOperation(IOOperationType::READ_ENTRY, std::move(onComplete), std::move(onError))
        , index(idx)
        , entryNum(entryNum)
    {}
};

} // namespace logsrd
