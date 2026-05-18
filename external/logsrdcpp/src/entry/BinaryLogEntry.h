#pragma once
#include "LogEntry.h"
#include <vector>

namespace logsrd {

class BinaryLogEntry : public LogEntry {
    std::vector<uint8_t> data_;
    mutable uint32_t cksumNum_{0};
    mutable bool cksumCached_{false};
    mutable std::vector<uint8_t> u8sCache_;

public:
    explicit BinaryLogEntry(std::vector<uint8_t> data);

    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::BINARY; }
};

} // namespace logsrd
