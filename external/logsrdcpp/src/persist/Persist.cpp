#include "Persist.h"
#include <filesystem>
#include <stdexcept>
#include <cstring>

namespace logsrd {

Persist::Persist(const std::string& dataDir, const std::string& hotLogFileName)
    : dataDir_(dataDir)
    , hotLogFileName_(hotLogFileName)
{
    // Ensure data directory exists
    std::filesystem::create_directories(dataDir_);
}

Persist::~Persist() = default;

void Persist::init() {
    newHotLog_ = std::make_unique<HotLog>(dataDir_, hotLogFileName_, true);
    oldHotLog_ = std::make_unique<HotLog>(dataDir_, hotLogFileName_, false);

    // Wire up index callbacks
    newHotLog_->addToIndex = [this](uint32_t entryNum, uint32_t offset,
                                     uint32_t length, bool isNew) {
        if (onIndexEntry) {
            onIndexEntry(entryNum, offset, length, isNew, false);
        }
    };

    oldHotLog_->addToIndex = [this](uint32_t entryNum, uint32_t offset,
                                     uint32_t length, bool isNew) {
        if (onIndexEntry) {
            onIndexEntry(entryNum, offset, length, isNew, false);
        }
    };

    newHotLog_->init();
    oldHotLog_->init();
}

void Persist::moveNewToOldHotLog() {
    if (moveInProgress_) return;
    moveInProgress_ = true;

    try {
        newHotLog_->blockIO();
        newHotLog_->closeAllFds();

        // Rename .new to .old
        std::string oldPath = dataDir_ + "/" + hotLogFileName_ + ".old";
        std::string newPath = dataDir_ + "/" + hotLogFileName_ + ".new";

        // Delete existing old hot log if present
        if (std::filesystem::exists(oldPath)) {
            std::filesystem::remove(oldPath);
        }

        std::filesystem::rename(newPath, oldPath);

        // Swap: create fresh new hot log, the old continues reading
        auto freshNew = std::make_unique<HotLog>(dataDir_, hotLogFileName_, true);
        freshNew->addToIndex = newHotLog_->addToIndex;  // Copy callback

        oldHotLog_ = std::move(newHotLog_);
        newHotLog_ = std::move(freshNew);

        oldHotLog_->unblockIO();
        newHotLog_->init();
    } catch (...) {
        moveInProgress_ = false;
        throw;
    }

    moveInProgress_ = false;
}

void Persist::emptyOldHotLog() {
    if (emptyInProgress_) return;
    emptyInProgress_ = true;

    try {
        oldHotLog_->blockIO();
        oldHotLog_->closeAllFds();

        // Delete old hot log file, create fresh
        std::string oldPath = dataDir_ + "/" + hotLogFileName_ + ".old";
        if (std::filesystem::exists(oldPath)) {
            std::filesystem::remove(oldPath);
        }

        auto freshOld = std::make_unique<HotLog>(dataDir_, hotLogFileName_, false);
        freshOld->addToIndex = oldHotLog_->addToIndex;
        oldHotLog_ = std::move(freshOld);
        oldHotLog_->init();
    } catch (...) {
        emptyInProgress_ = false;
        throw;
    }

    emptyInProgress_ = false;
}

size_t Persist::globalIndexEntryCount() const {
    size_t count = 0;
    // Count tracked via the LogIndex; Persist doesn't hold index state.
    // This is a placeholder — actual counting done by Server/Log.
    return count;
}

} // namespace logsrd
