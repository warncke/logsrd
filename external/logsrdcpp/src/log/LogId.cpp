#include "LogId.h"
#include "../Util.h"
#include <cstring>
#include <algorithm>
#include <array>
#include <stdexcept>

namespace logsrd {

LogId::LogId(std::array<uint8_t, 16> bytes)
    : bytes_(bytes)
{}

LogId LogId::newRandom() {
    auto buf = randomBytes(16);
    std::array<uint8_t, 16> arr;
    std::copy_n(buf.begin(), 16, arr.begin());
    return LogId(arr);
}

LogId LogId::fromBytes(std::span<const uint8_t, 16> bytes) {
    std::array<uint8_t, 16> arr;
    std::copy_n(bytes.begin(), 16, arr.begin());
    return LogId(arr);
}

LogId LogId::fromBase64(std::string_view base64) {
    auto decoded = base64urlDecode(base64);
    if (decoded.size() != 16) {
        throw std::runtime_error("Invalid LogId base64 length");
    }
    std::array<uint8_t, 16> arr;
    std::copy_n(decoded.begin(), 16, arr.begin());
    return LogId(arr);
}

const std::string& LogId::base64() const {
    if (base64_.empty()) {
        base64_ = base64urlEncode(bytes_);
    }
    return base64_;
}

const std::string& LogId::logDirPrefix() const {
    if (dirPrefix_.empty()) {
        char buf[6];
        std::snprintf(buf, sizeof(buf), "%02x/%02x", bytes_[0], bytes_[1]);
        dirPrefix_ = buf;
    }
    return dirPrefix_;
}

bool LogId::operator==(const LogId& other) const {
    return bytes_ == other.bytes_;
}

} // namespace logsrd
