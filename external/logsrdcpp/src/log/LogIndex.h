#pragma once
#include <cstdint>
#include <vector>
#include <tuple>
#include <stdexcept>
#include "../Globals.h"

namespace logsrd {

// In-memory index of [entryNum, offset, length] triplets
class LogIndex {
protected:
    std::vector<uint32_t> en_;  // [entryNum, offset, length, entryNum, ...]
    uint32_t lcNum_{0};
    uint32_t lcOff_{0};
    uint32_t lcLen_{0};
    bool hasConfig_{false};

public:
    LogIndex() = default;
    virtual ~LogIndex() = default;

    void addEntry(EntryType entryType, uint32_t entryNum,
                  uint32_t offset, uint32_t length);
    void addEntry(EntryType entryType, uint32_t entryNum,
                  uint32_t offset, uint32_t length, bool isConfigEntry);

    bool hasEntry(uint32_t entryNum) const;
    std::tuple<uint32_t, uint32_t, uint32_t> entry(uint32_t entryNum) const;

    const std::vector<uint32_t>& entries() const { return en_; }
    size_t entryCount() const { return en_.size() / 3; }

    void appendIndex(const LogIndex& other);

    virtual uint64_t byteLength(uint32_t prefixByteLength) const;

    bool hasConfig() const { return hasConfig_; }
    std::tuple<uint32_t, uint32_t, uint32_t> lastConfig() const;
    uint32_t lastConfigEntryNum() const;

    bool hasEntries() const { return en_.size() >= 3; }
    std::tuple<uint32_t, uint32_t, uint32_t> lastEntry() const;
    uint32_t maxEntryNum() const;
};

// GlobalLogIndex — byteLength uses GLOBAL_LOG_PREFIX_BYTE_LENGTH
class GlobalLogIndex : public LogIndex {
public:
    uint64_t byteLength() const {
        return LogIndex::byteLength(GLOBAL_LOG_PREFIX_BYTE_LENGTH);
    }
};

// LogLogIndex — byteLength uses LOG_LOG_PREFIX_BYTE_LENGTH
class LogLogIndex : public LogIndex {
public:
    uint64_t byteLength() const {
        return LogIndex::byteLength(LOG_LOG_PREFIX_BYTE_LENGTH);
    }
};

} // namespace logsrd
