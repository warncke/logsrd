#pragma once
#include <cstdint>
#include <span>
#include <vector>
#include <memory>
#include "../Globals.h"

namespace logsrd {

class LogEntry {
public:
    virtual ~LogEntry() = default;

    virtual std::vector<uint8_t> u8() const = 0;
    virtual std::vector<std::span<const uint8_t>> u8s() const = 0;
    virtual size_t byteLength() const = 0;
    virtual uint32_t cksum(uint32_t entryNum) const = 0;
    virtual bool verify() const = 0;
    virtual EntryType type() const = 0;

    // Helpers for u8s(): build a contiguous buffer and return a span to it.
    // Subclasses call this in u8s() to avoid dangling span issues.
    std::vector<std::span<const uint8_t>> u8sFromBuffer(
        std::vector<uint8_t>& cache, std::vector<uint8_t> buf) const {
        cache = std::move(buf);
        return {std::span<const uint8_t>(cache.data(), cache.size())};
    }


};

// Partial parse result (for stream reads)
struct PartialResult {
    std::unique_ptr<LogEntry> entry;
    size_t needBytes = 0;
    std::string err;
};

} // namespace logsrd
