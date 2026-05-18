#include "CommandLogEntry.h"
#include "../Util.h"
#include "../Globals.h"

namespace logsrd {

CommandLogEntry::CommandLogEntry(std::vector<uint8_t> commandNameU8,
                                 std::vector<uint8_t> commandValueU8)
    : commandNameU8(std::move(commandNameU8))
    , commandValueU8(std::move(commandValueU8))
{}

std::vector<uint8_t> CommandLogEntry::u8() const {
    return commandValueU8;
}

std::vector<std::span<const uint8_t>> CommandLogEntry::u8s() const {
    u8sCache_.clear();
    u8sCache_.reserve(2 + commandNameU8.size() + commandValueU8.size());
    u8sCache_.push_back(TYPE_BYTE_COMMAND);
    u8sCache_.insert(u8sCache_.end(), commandNameU8.begin(), commandNameU8.end());
    u8sCache_.insert(u8sCache_.end(), commandValueU8.begin(), commandValueU8.end());
    return {std::span<const uint8_t>(u8sCache_.data(), u8sCache_.size())};
}

size_t CommandLogEntry::byteLength() const {
    return 2 + commandValueU8.size();
}

uint32_t CommandLogEntry::cksum(uint32_t entryNum) const {
    uint32_t c = 0;
    c = crc32_bytes(std::span<const uint8_t>(reinterpret_cast<const uint8_t*>(&entryNum), 4), c);
    c = crc32_bytes(std::span<const uint8_t>(commandNameU8), c);
    c = crc32_bytes(std::span<const uint8_t>(commandValueU8), c);
    return c;
}

bool CommandLogEntry::verify() const {
    return true; // Command entries don't store CRC at this level
}

std::string CommandLogEntry::value() const {
    throw std::runtime_error("Not implemented");
}

void CommandLogEntry::setValue(const std::string& val) {
    throw std::runtime_error("Not implemented");
}

} // namespace logsrd
