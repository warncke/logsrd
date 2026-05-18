#pragma once
#include "LogEntry.h"
#include <optional>

namespace logsrd {

class LogLogCheckpoint : public LogEntry {
    int16_t lastEntryOffset_;
    uint16_t lastEntryLength_;
    uint32_t lastConfigOffset_;
    uint32_t crc_;

    mutable uint32_t cksumNum_{0};
    mutable bool cksumCached_{false};
    mutable std::optional<std::vector<uint8_t>> entryU8_;
    mutable std::vector<uint8_t> u8sCache_;

public:
    LogLogCheckpoint(int16_t lastEntryOffset, uint16_t lastEntryLength,
                     uint32_t lastConfigOffset, uint32_t crc = 0);

    int16_t lastEntryOffset() const { return lastEntryOffset_; }
    uint16_t lastEntryLength() const { return lastEntryLength_; }
    uint32_t lastConfigOffset() const { return lastConfigOffset_; }
    uint32_t storedCrc() const { return crc_; }

    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::LOG_LOG_CHECKPOINT; }
};

} // namespace logsrd
