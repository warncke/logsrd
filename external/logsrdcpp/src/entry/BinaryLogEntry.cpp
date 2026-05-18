#include "BinaryLogEntry.h"
#include "../Util.h"
#include "../Globals.h"

namespace logsrd {

BinaryLogEntry::BinaryLogEntry(std::vector<uint8_t> data)
    : data_(std::move(data))
{}

std::vector<uint8_t> BinaryLogEntry::u8() const {
    return data_;
}

std::vector<std::span<const uint8_t>> BinaryLogEntry::u8s() const {
    u8sCache_.clear();
    u8sCache_.reserve(1 + data_.size());
    u8sCache_.push_back(TYPE_BYTE_BINARY);
    u8sCache_.insert(u8sCache_.end(), data_.begin(), data_.end());
    return {std::span<const uint8_t>(u8sCache_.data(), u8sCache_.size())};
}

size_t BinaryLogEntry::byteLength() const {
    return 1 + data_.size();
}

uint32_t BinaryLogEntry::cksum(uint32_t entryNum) const {
    if (!cksumCached_) {
        uint32_t c = 0;
        c = crc32_bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(&entryNum), 4), c);
        c = crc32_bytes(std::span<const uint8_t>(data_), c);
        cksumNum_ = c;
        cksumCached_ = true;
    }
    return cksumNum_;
}

bool BinaryLogEntry::verify() const {
    return true;
}

} // namespace logsrd
