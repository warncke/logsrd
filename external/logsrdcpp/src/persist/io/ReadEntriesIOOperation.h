#pragma once
#include "IOOperation.h"
#include "../../log/LogIndex.h"
#include "../../entry/LogEntry.h"
#include <memory>
#include <vector>

namespace logsrd {

class ReadEntriesIOOperation : public IOOperation {
public:
    LogIndex* index{nullptr};
    std::vector<uint32_t> entryNums;
    std::vector<std::unique_ptr<LogEntry>> entries;
    size_t bytesRead{0};

    ReadEntriesIOOperation(LogIndex* idx, std::vector<uint32_t> entryNums,
                           CompleteCallback onComplete = nullptr,
                           CompleteCallback onError = nullptr)
        : IOOperation(IOOperationType::READ_ENTRIES, std::move(onComplete), std::move(onError))
        , index(idx)
        , entryNums(std::move(entryNums))
    {}
};

} // namespace logsrd
