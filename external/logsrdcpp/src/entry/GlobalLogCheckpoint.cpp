#include "GlobalLogCheckpoint.h"
#include "../Util.h"
#include "../Globals.h"

namespace logsrd {

GlobalLogCheckpoint::GlobalLogCheckpoint(int16_t lastEntryOffset,
                                         uint16_t lastEntryLength, uint32_t crc)
    : lastEntryOffset_(lastEntryOffset)
    , lastEntryLength_(lastEntryLength)
    , crc_(crc)
{}

std::vector<uint8_t> GlobalLogCheckpoint::u8() const {
    if (!entryU8_) {
        std::vector<uint8_t> buf;
        buf.reserve(4);
        writeI16LE(buf, lastEntryOffset_);
        writeU16LE(buf, lastEntryLength_);
        entryU8_ = std::move(buf);
    }
    return *entryU8_;
}

std::vector<std::span<const uint8_t>> GlobalLogCheckpoint::u8s() const {
    auto payload = u8();
    auto cksumVal = cksum(0);

    u8sCache_.clear();
    u8sCache_.reserve(9);
    u8sCache_.push_back(TYPE_BYTE_GLOBAL_LOG_CHECKPOINT);
    u8sCache_.insert(u8sCache_.end(), payload.begin(), payload.end());
    writeU32LE(u8sCache_, cksumVal);

    return {std::span<const uint8_t>(u8sCache_.data(), u8sCache_.size())};
}

size_t GlobalLogCheckpoint::byteLength() const {
    return GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH;
}

uint32_t GlobalLogCheckpoint::cksum(uint32_t /*entryNum*/) const {
    if (!cksumCached_) {
        auto payload = u8();
        uint32_t c = 0;
        uint8_t typeByte = TYPE_BYTE_GLOBAL_LOG_CHECKPOINT;
        c = crc32_bytes(std::span<const uint8_t>(&typeByte, 1), c);
        c = crc32_bytes(std::span<const uint8_t>(payload), c);
        cksumNum_ = c;
        cksumCached_ = true;
    }
    return cksumNum_;
}

bool GlobalLogCheckpoint::verify() const {
    if (crc_ == 0) return false;
    return crc_ == cksum(0);
}

} // namespace logsrd
