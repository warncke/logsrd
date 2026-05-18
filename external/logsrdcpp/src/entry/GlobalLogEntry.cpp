#include "GlobalLogEntry.h"
#include "../Util.h"
#include "../Globals.h"
#include <cstring>

namespace logsrd {

GlobalLogEntry::GlobalLogEntry(LogId logId, uint32_t entryNum,
                               std::unique_ptr<LogEntry> entry, uint32_t crc)
    : logId_(std::move(logId))
    , entryNum_(entryNum)
    , entry_(std::move(entry))
    , crc_(crc)
{}

std::string GlobalLogEntry::key() const {
    return logId_.base64() + "-" + std::to_string(entryNum_);
}

const std::vector<uint8_t>& GlobalLogEntry::prefixU8() const {
    if (!prefixU8_) {
        std::vector<uint8_t> buf;
        buf.reserve(GLOBAL_LOG_PREFIX_BYTE_LENGTH);
        buf.push_back(TYPE_BYTE_GLOBAL_LOG);
        auto idBytes = logId_.bytes();
        buf.insert(buf.end(), idBytes.begin(), idBytes.end());
        writeU32LE(buf, entryNum_);
        writeU16LE(buf, static_cast<uint16_t>(entry_->byteLength()));
        writeU32LE(buf, cksum(entryNum_));
        prefixU8_ = std::move(buf);
    }
    return *prefixU8_;
}

std::vector<uint8_t> GlobalLogEntry::u8() const {
    return entry_->u8();
}

std::vector<std::span<const uint8_t>> GlobalLogEntry::u8s() const {
    auto& pfx = prefixU8();
    auto inner = entry_->u8s();

    // Build contiguous buffer: [prefix | innerChunk1 | innerChunk2 | ...]
    u8sCache_.clear();
    u8sCache_.insert(u8sCache_.end(), pfx.begin(), pfx.end());
    for (auto& s : inner) {
        u8sCache_.insert(u8sCache_.end(), s.begin(), s.end());
    }
    return {std::span<const uint8_t>(u8sCache_.data(), u8sCache_.size())};
}

size_t GlobalLogEntry::byteLength() const {
    return GLOBAL_LOG_PREFIX_BYTE_LENGTH + entry_->byteLength();
}

uint32_t GlobalLogEntry::cksum(uint32_t entryNum) const {
    if (!cksumCached_) {
        auto innerData = entry_->u8();
        uint32_t c = 0;
        c = crc32_bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(&entryNum), 4), c);
        c = crc32_bytes(std::span<const uint8_t>(innerData), c);
        cksumNum_ = c;
        cksumCached_ = true;
    }
    return cksumNum_;
}

bool GlobalLogEntry::verify() const {
    if (crc_ == 0) return false;
    return crc_ == cksum(entryNum_);
}

} // namespace logsrd
