#include "JSONLogEntry.h"
#include "../Util.h"
#include "../Globals.h"

namespace logsrd {

JSONLogEntry::JSONLogEntry(std::string jsonStr)
    : jsonStr_(std::move(jsonStr))
{}

JSONLogEntry::JSONLogEntry(std::vector<uint8_t> jsonU8)
    : jsonU8_(std::move(jsonU8))
{}

std::string JSONLogEntry::str() const {
    if (!jsonStr_) {
        jsonStr_ = std::string(jsonU8_->begin(), jsonU8_->end());
    }
    return *jsonStr_;
}

std::vector<uint8_t> JSONLogEntry::u8() const {
    if (!jsonU8_) {
        jsonU8_ = std::vector<uint8_t>(jsonStr_->begin(), jsonStr_->end());
    }
    return *jsonU8_;
}

std::vector<std::span<const uint8_t>> JSONLogEntry::u8s() const {
    auto payload = u8();
    u8sCache_.clear();
    u8sCache_.reserve(1 + payload.size());
    u8sCache_.push_back(TYPE_BYTE_JSON);
    u8sCache_.insert(u8sCache_.end(), payload.begin(), payload.end());
    return {std::span<const uint8_t>(u8sCache_.data(), u8sCache_.size())};
}

size_t JSONLogEntry::byteLength() const {
    return 1 + u8().size();
}

uint32_t JSONLogEntry::cksum(uint32_t entryNum) const {
    if (!cksumCached_) {
        auto payload = u8();
        uint32_t c = 0;
        c = crc32_bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(&entryNum), 4), c);
        c = crc32_bytes(std::span<const uint8_t>(payload), c);
        cksumNum_ = c;
        cksumCached_ = true;
    }
    return cksumNum_;
}

bool JSONLogEntry::verify() const {
    return true;
}

} // namespace logsrd
