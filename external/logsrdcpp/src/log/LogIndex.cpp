#include "LogIndex.h"
#include "../entry/command/CreateLogCommand.h"
#include "../entry/command/SetConfigCommand.h"
#include <algorithm>

namespace logsrd {

void LogIndex::addEntry(EntryType entryType, uint32_t entryNum,
                        uint32_t offset, uint32_t length) {
    // Check if this is a config entry
    if (entryType == EntryType::COMMAND) {
        // We can't check instanceof without the entry object, so this is
        // called with the raw type. The caller passes the type.
        // For now assume all COMMAND entries are config (CreateLog or SetConfig)
        // This will be refined when we have the full Log class
    }

    en_.push_back(entryNum);
    en_.push_back(offset);
    en_.push_back(length);
}

// Version called with actual entry object for config tracking
void LogIndex::addEntry(EntryType entryType, uint32_t entryNum,
                        uint32_t offset, uint32_t length,
                        bool isConfigEntry) {
    if (isConfigEntry) {
        if (!hasConfig_ || entryNum > lcNum_) {
            lcNum_ = entryNum;
            lcOff_ = offset;
            lcLen_ = length;
            hasConfig_ = true;
        }
    }

    en_.push_back(entryNum);
    en_.push_back(offset);
    en_.push_back(length);
}

bool LogIndex::hasEntry(uint32_t entryNum) const {
    for (size_t i = 0; i < en_.size(); i += 3) {
        if (en_[i] == entryNum) return true;
    }
    return false;
}

std::tuple<uint32_t, uint32_t, uint32_t> LogIndex::entry(uint32_t entryNum) const {
    if (en_.empty()) {
        throw std::runtime_error("no entries");
    }
    // Arithmetic: assumes contiguous numbering starting from en_[0]
    uint32_t firstEntryNum = en_[0];
    if (entryNum < firstEntryNum) {
        throw std::runtime_error("entryNum " + std::to_string(entryNum) + " not found");
    }
    size_t indexOffset = (entryNum - firstEntryNum) * 3;
    if (indexOffset + 2 >= en_.size()) {
        throw std::runtime_error("entryNum " + std::to_string(entryNum) + " not found");
    }
    return {en_[indexOffset], en_[indexOffset + 1], en_[indexOffset + 2]};
}

void LogIndex::appendIndex(const LogIndex& other) {
    if (other.hasConfig_ && (!hasConfig_ || other.lcNum_ > lcNum_)) {
        lcNum_ = other.lcNum_;
        lcOff_ = other.lcOff_;
        lcLen_ = other.lcLen_;
        hasConfig_ = true;
    }
    en_.insert(en_.end(), other.en_.begin(), other.en_.end());
}

uint64_t LogIndex::byteLength(uint32_t prefixByteLength) const {
    uint64_t total = 0;
    for (size_t i = 0; i < en_.size(); i += 3) {
        total += (en_[i + 2] - prefixByteLength);
    }
    return total;
}

std::tuple<uint32_t, uint32_t, uint32_t> LogIndex::lastConfig() const {
    if (!hasConfig_) {
        throw std::runtime_error("no last config");
    }
    return {lcNum_, lcOff_, lcLen_};
}

uint32_t LogIndex::lastConfigEntryNum() const {
    if (!hasConfig_) {
        throw std::runtime_error("no last config");
    }
    return lcNum_;
}

std::tuple<uint32_t, uint32_t, uint32_t> LogIndex::lastEntry() const {
    if (!hasEntries()) {
        throw std::runtime_error("no last entry");
    }
    size_t i = en_.size() - 3;
    return {en_[i], en_[i + 1], en_[i + 2]};
}

uint32_t LogIndex::maxEntryNum() const {
    if (!hasEntries()) {
        throw std::runtime_error("no entries");
    }
    return en_[en_.size() - 3];
}

} // namespace logsrd
