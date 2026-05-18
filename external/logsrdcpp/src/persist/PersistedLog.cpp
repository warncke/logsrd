#include "PersistedLog.h"
#include "../entry/GlobalLogEntry.h"
#include "../entry/LogLogEntry.h"
#include "../entry/GlobalLogCheckpoint.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/uio.h>
#include <cstring>
#include <cerrno>
#include <stdexcept>
#include <algorithm>

namespace logsrd {

PersistedLog::PersistedLog(std::string logFile)
    : logFile_(std::move(logFile))
{}

PersistedLog::~PersistedLog() {
    closeAllFds();
    if (ownsQueue_) {
        delete ioQueue_;
    }
}

void PersistedLog::init(EntryType entryType, size_t checkpointInterval,
                         size_t checkpointByteLength) {
    // Try to open existing file for reading
    int fd = ::open(logFile_.c_str(), O_RDONLY);
    if (fd < 0) {
        if (errno == ENOENT) {
            byteLength_ = 0;
            return;
        }
        throw std::runtime_error("Failed to open " + logFile_ + ": " + std::strerror(errno));
    }

    // Scan checkpoint-aligned chunks
    off_t fileSize = ::lseek(fd, 0, SEEK_END);
    if (fileSize < 0) {
        ::close(fd);
        throw std::runtime_error("Failed to seek " + logFile_);
    }
    ::lseek(fd, 0, SEEK_SET);

    std::vector<uint8_t> buf(checkpointInterval + checkpointByteLength);
    off_t pos = 0;
    uint32_t lastEntryNum = 0;
    uint32_t lastOffset = 0;
    uint32_t lastLength = 0;
    bool hasLastEntry = false;

    while (pos < fileSize) {
        size_t toRead = std::min<size_t>(checkpointInterval + checkpointByteLength,
                                          fileSize - pos);
        ssize_t n = ::read(fd, buf.data(), toRead);
        if (n <= 0) break;

        auto chunk = std::span<const uint8_t>(buf.data(), n);
        size_t offset = 0;

        while (offset < chunk.size()) {
            // Try partial parse
            auto result = EntryFactory::fromPartialU8(chunk.subspan(offset));
            if (result.needBytes > 0) {
                break; // need more data — move to next chunk
            }
            if (!result.err.empty()) {
                break; // corrupt data — stop scanning
            }
            if (result.entry) {
                auto* entry = result.entry.get();
                uint32_t entryNum = 0;
                EntryType type = entry->type();

                // Extract entryNum based on type
                if (auto* gle = dynamic_cast<GlobalLogEntry*>(entry)) {
                    entryNum = gle->entryNum();
                } else if (auto* lle = dynamic_cast<LogLogEntry*>(entry)) {
                    entryNum = lle->entryNum();
                } else if (auto* cp = dynamic_cast<GlobalLogCheckpoint*>(entry)) {
                    // Checkpoint: restore last entry offset/length
                    hasLastEntry = true;
                    lastOffset = pos + offset + cp->lastEntryOffset();
                    lastLength = cp->lastEntryLength();
                    offset += entry->byteLength();
                    continue;
                }

                if (hasLastEntry) {
                    // Use restored offset/length from preceding checkpoint
                    onInitEntry(entryNum, lastOffset, lastLength, type, false);
                    hasLastEntry = false;
                } else {
                    onInitEntry(entryNum, pos + offset, entry->byteLength(), type, false);
                }

                offset += entry->byteLength();
            } else {
                offset += 1; // skip unknown byte
            }
        }

        pos += toRead;
    }

    byteLength_ = pos;
    ::close(fd);
}

void PersistedLog::blockIO() {
    ioBlocked_ = true;
}

void PersistedLog::unblockIO() {
    ioBlocked_ = false;
}

void PersistedLog::closeAllFds() {
    closeWriteFd();
    for (int fd : freeReadFds_) {
        ::close(fd);
    }
    freeReadFds_.clear();
    for (int fd : openReadFds_) {
        ::close(fd);
    }
    openReadFds_.clear();
}

int PersistedLog::getReadFd() {
    if (!freeReadFds_.empty()) {
        int fd = freeReadFds_.back();
        freeReadFds_.pop_back();
        return fd;
    }
    if (openReadFds_.size() < maxReadFds_) {
        int fd = ::open(logFile_.c_str(), O_RDONLY);
        if (fd < 0) return -1;
        openReadFds_.push_back(fd);
        return fd;
    }
    return -1; // at max
}

void PersistedLog::doneReadFd(int fd) {
    freeReadFds_.push_back(fd);
}

void PersistedLog::closeReadFd(int fd) {
    auto it = std::find(openReadFds_.begin(), openReadFds_.end(), fd);
    if (it != openReadFds_.end()) {
        ::close(fd);
        openReadFds_.erase(it);
    }
    auto fit = std::find(freeReadFds_.begin(), freeReadFds_.end(), fd);
    if (fit != freeReadFds_.end()) {
        freeReadFds_.erase(fit);
    }
}

int PersistedLog::getWriteFd() {
    if (writeFd_ < 0) {
        writeFd_ = ::open(logFile_.c_str(), O_WRONLY | O_CREAT | O_APPEND, 0644);
    }
    return writeFd_;
}

void PersistedLog::closeWriteFd() {
    if (writeFd_ >= 0) {
        ::close(writeFd_);
        writeFd_ = -1;
    }
}

void PersistedLog::enqueueOp(IOOperation* op, const std::string& logIdBase64) {
    if (globalIOQueue_) {
        globalIOQueue_->enqueue(op, logIdBase64);
    } else if (ioQueue_) {
        ioQueue_->enqueue(op);
    }
    processOps();
}

void PersistedLog::processOps() {
    if (ioBlocked_) return;

    std::pair<std::span<IOOperation*>, std::span<IOOperation*>> ready;
    if (globalIOQueue_) {
        auto [reads, writes] = globalIOQueue_->getReady();
        if (!reads.empty()) processReadOps({reads.data(), reads.size()});
        if (!writes.empty()) processWriteOps({writes.data(), writes.size()});
    } else if (ioQueue_) {
        ready = ioQueue_->getReady();
        if (!ready.first.empty()) processReadOps(ready.first);
        if (!ready.second.empty()) processWriteOps(ready.second);
    }
}

void PersistedLog::truncate(size_t newByteLength) {
    closeAllFds();
    if (newByteLength < 1) {
        throw std::runtime_error("Invalid truncate length");
    }

    // Create backup
    std::string backupFile = logFile_ + ".bak";
    int src = ::open(logFile_.c_str(), O_RDONLY);
    if (src < 0) throw std::runtime_error("Cannot open for truncate backup");

    int dst = ::open(backupFile.c_str(), O_WRONLY | O_CREAT | O_TRUNC, 0644);
    if (dst < 0) { ::close(src); throw std::runtime_error("Cannot create backup"); }

    std::vector<uint8_t> buf(16384);
    off_t remaining = newByteLength;
    while (remaining > 0) {
        size_t toRead = std::min<size_t>(buf.size(), remaining);
        ssize_t n = ::read(src, buf.data(), toRead);
        if (n <= 0) break;
        ssize_t w = ::write(dst, buf.data(), n);
        if (w < 0) break;
        remaining -= w;
    }

    ::close(src);
    ::close(dst);

    if (::truncate(logFile_.c_str(), newByteLength) < 0) {
        throw std::runtime_error("truncate failed");
    }

    byteLength_ = newByteLength;
}

} // namespace logsrd
