#pragma once
#include "LogEntry.h"
#include <optional>

namespace logsrd {

class LogLogEntry : public LogEntry {
    uint32_t entryNum_;
    std::unique_ptr<LogEntry> entry_;
    uint32_t crc_;

    mutable uint32_t cksumNum_{0};
    mutable bool cksumCached_{false};
    mutable std::optional<std::vector<uint8_t>> prefixU8_;
    mutable std::vector<uint8_t> u8sCache_;

public:
    LogLogEntry(uint32_t entryNum, std::unique_ptr<LogEntry> entry, uint32_t crc = 0);

    uint32_t entryNum() const { return entryNum_; }
    const LogEntry& entry() const { return *entry_; }
    uint32_t storedCrc() const { return crc_; }

    const std::vector<uint8_t>& prefixU8() const;

    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::LOG_LOG; }
};

} // namespace logsrd
