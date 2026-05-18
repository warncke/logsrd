#pragma once
#include "LogEntry.h"
#include <string>
#include <optional>

namespace logsrd {

class JSONLogEntry : public LogEntry {
    mutable std::optional<std::string> jsonStr_;
    mutable std::optional<std::vector<uint8_t>> jsonU8_;
    mutable uint32_t cksumNum_{0};
    mutable bool cksumCached_{false};
    mutable std::vector<uint8_t> u8sCache_;

public:
    explicit JSONLogEntry(std::string jsonStr);
    explicit JSONLogEntry(std::vector<uint8_t> jsonU8);

    std::string str() const;

    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::JSON; }
};

} // namespace logsrd
