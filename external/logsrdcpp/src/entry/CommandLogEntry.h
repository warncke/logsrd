#pragma once
#include "LogEntry.h"
#include <vector>
#include <string>
#include <stdexcept>

namespace logsrd {

class CommandLogEntry : public LogEntry {
public:
    std::vector<uint8_t> commandNameU8;
    std::vector<uint8_t> commandValueU8;

    mutable std::vector<uint8_t> u8sCache_;

    CommandLogEntry(std::vector<uint8_t> commandNameU8, std::vector<uint8_t> commandValueU8);

    std::vector<uint8_t> u8() const override;
    std::vector<std::span<const uint8_t>> u8s() const override;
    size_t byteLength() const override;
    uint32_t cksum(uint32_t entryNum) const override;
    bool verify() const override;
    EntryType type() const override { return EntryType::COMMAND; }

    virtual std::string value() const;
    virtual void setValue(const std::string& val);
};

} // namespace logsrd
