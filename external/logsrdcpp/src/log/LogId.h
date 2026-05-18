#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <array>

namespace logsrd {

class LogId {
    std::array<uint8_t, 16> bytes_{};

    // Cache base64 and dir prefix after first compute
    mutable std::string base64_;
    mutable std::string dirPrefix_;

    explicit LogId(std::array<uint8_t, 16> bytes);

public:
    LogId() = default;

    static LogId newRandom();
    static LogId fromBytes(std::span<const uint8_t, 16> bytes);
    static LogId fromBase64(std::string_view base64);

    const std::array<uint8_t, 16>& bytes() const { return bytes_; }
    std::span<const uint8_t, 16> span() const { return std::span<const uint8_t, 16>(bytes_.data(), 16); }
    const std::string& base64() const;
    const std::string& logDirPrefix() const;
    size_t byteLength() const { return 16; }

    bool operator==(const LogId& other) const;
    bool operator!=(const LogId& other) const { return !(*this == other); }
};

} // namespace logsrd
