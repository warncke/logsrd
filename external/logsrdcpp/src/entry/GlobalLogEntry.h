#pragma once
#include "LogEntry.h"
#include "../log/LogId.h"
#include <string>
#include <optional>

namespace logsrd {

class GlobalLogEntry : public LogEntry {
    LogId logId_;
    uint32_t entryNum_;
    std::unique_ptr<LogEntry> entry_;
    uint32_t crc_;  // stored CRC (0 = unknown)

    mutable uint32_t cksumNum_{0};
    mutable bool cksumCached_{false};
    mutable std::optional<std::vector<uint8_t>> prefixU8_;
    mutable std::vector<uint8_t> u8sCache_;

public:
    GlobalLogEntry(LogId logId, uint32_t entryNum, std::unique_ptr<LogEntry> entry, uint32_t crc = 0);

    const LogId& logId() const { return logId_; }
    uint32_t entryNum() const { return entryNum_; }
    const LogEntry& entry() const { return *entry_; }
    uint32_t storedCrc() const { return crc_; }

    std::string key() const;
    const std::vector<uint8_t>& prefixU8() const;

    // LogEntry interface
    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::GLOBAL_LOG; }
};

} // namespace logsrd
