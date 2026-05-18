#pragma once
#include <memory>
#include <string>
#include "HotLog.h"

namespace logsrd {

class Persist {
    std::string dataDir_;
    std::string hotLogFileName_;
    std::unique_ptr<HotLog> newHotLog_;
    std::unique_ptr<HotLog> oldHotLog_;
    bool emptyInProgress_{false};
    bool moveInProgress_{false};

    // Callback from HotLog → Log when an entry is indexed
    // Set by Server during init
public:
    using IndexEntryFn = std::function<void(uint32_t entryNum, uint32_t offset,
                                            uint32_t length, bool isNew, bool isConfig)>;
    IndexEntryFn onIndexEntry;

    Persist(const std::string& dataDir, const std::string& hotLogFileName = std::string(DEFAULT_HOT_LOG_FILE_NAME));
    ~Persist();

    void init();

    HotLog* newHotLog() const { return newHotLog_.get(); }
    HotLog* oldHotLog() const { return oldHotLog_.get(); }

    void moveNewToOldHotLog();
    void emptyOldHotLog();

    size_t globalIndexEntryCount() const;
};

} // namespace logsrd
