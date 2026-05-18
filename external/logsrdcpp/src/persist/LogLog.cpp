#include "LogLog.h"
#include "../entry/LogLogEntry.h"
#include "../entry/LogLogCheckpoint.h"
#include "../Util.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/uio.h>
#include <cstring>
#include <cerrno>
#include <stdexcept>

namespace logsrd {

LogLog::LogLog(const std::string& logFile)
    : PersistedLog(logFile)
{
    maxReadFds_ = MAX_READ_FDS;
    ioQueue_ = new IOQueue();
    ownsQueue_ = true;
}

std::string LogLog::logName() const {
    return "logLog";
}

void LogLog::processWriteOps(std::span<IOOperation*> ops) {
    int fd = getWriteFd();
    if (fd < 0) {
        for (auto* op : ops) op->completeWithError();
        return;
    }

    size_t currentPos = byteLength_;
    std::vector<iovec> iov;
    std::vector<std::vector<uint8_t>> buffers;

    for (auto* op : ops) {
        auto* writeOp = static_cast<WriteIOOperation*>(op);
        if (!writeOp->entry) { writeOp->completeWithError(); continue; }

        auto entry = std::move(writeOp->entry);

        // Build checkpoint if crossing boundary
        size_t nextCkpt = ((currentPos + LOG_LOG_CHECKPOINT_INTERVAL - 1) /
                           LOG_LOG_CHECKPOINT_INTERVAL) *
                          LOG_LOG_CHECKPOINT_INTERVAL;
        size_t entrySize = entry->byteLength();

        if (currentPos + entrySize > nextCkpt && currentPos < nextCkpt) {
            int16_t ckptOffset = -static_cast<int16_t>(currentPos);
            uint16_t ckptLength = static_cast<uint16_t>(entrySize);
            uint32_t lastConfigOffset = 0;

            // Build 13-byte LogLogCheckpoint: [type(1)|offset(2)|length(2)|config(4)|cksum(4)]
            std::vector<uint8_t> cpBytes(13);
            cpBytes[0] = TYPE_BYTE_LOG_LOG_CHECKPOINT;
            writeI16LEAt(cpBytes, 1, ckptOffset);
            writeU16LEAt(cpBytes, 3, ckptLength);
            writeU32LEAt(cpBytes, 5, lastConfigOffset);

            uint32_t c = 0;
            c = crc32_bytes(std::span<const uint8_t>(&cpBytes[0], 1), c);
            c = crc32_bytes(std::span<const uint8_t>(&cpBytes[1], 8), c);
            writeU32LEAt(cpBytes, 9, c);

            buffers.push_back(std::move(cpBytes));
            iov.push_back({buffers.back().data(), buffers.back().size()});
            currentPos += buffers.back().size();
        }

        auto u8s = entry->u8s();
        for (auto& s : u8s) {
            std::vector<uint8_t> buf(s.begin(), s.end());
            buffers.push_back(std::move(buf));
            iov.push_back({buffers.back().data(), buffers.back().size()});
            currentPos += buffers.back().size();
        }
    }

    if (iov.empty()) return;

    ssize_t written = ::writev(fd, iov.data(), iov.size());
    if (written < 0) {
        for (auto* op : ops) op->completeWithError();
        return;
    }

    if (::fdatasync(fd) < 0) {
        for (auto* op : ops) op->completeWithError();
        return;
    }

    byteLength_ = currentPos;

    size_t bufIdx = 0;
    for (auto* op : ops) {
        auto* writeOp = static_cast<WriteIOOperation*>(op);
        if (!writeOp->entry) continue;

        size_t opBytes = 0;
        while (bufIdx < buffers.size()) {
            opBytes = buffers[bufIdx].size();
            bufIdx++;
            break;
        }

        if (addLogEntry) {
            addLogEntry(writeOp->entryNum, currentPos - opBytes, opBytes);
        }
        writeOp->bytesWritten = opBytes;
        writeOp->complete();
    }
}

void LogLog::processReadOps(std::span<IOOperation*> ops) {
    for (auto* op : ops) {
        auto* readOp = static_cast<ReadEntryIOOperation*>(op);
        if (!readOp->index) { readOp->completeWithError(); continue; }

        int fd = getReadFd();
        if (fd < 0) { readOp->completeWithError(); continue; }

        try {
            auto [offset, length, entryNum] = readOp->index->entry(readOp->entryNum);
            auto [entry, bytesRead] = processReadLogEntry(
                fd, entryNum, offset, length,
                LOG_LOG_CHECKPOINT_INTERVAL,
                LOG_LOG_CHECKPOINT_BYTE_LENGTH,
                EntryType::LOG_LOG,
                LOG_LOG_PREFIX_BYTE_LENGTH);
            readOp->resultEntry = std::move(entry);
            readOp->bytesRead = bytesRead;
            doneReadFd(fd);
            readOp->complete();
        } catch (...) {
            doneReadFd(fd);
            readOp->completeWithError();
        }
    }
}

std::pair<std::unique_ptr<LogEntry>, size_t> LogLog::processReadLogEntry(
    int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
    size_t checkpointInterval, size_t checkpointByteLength,
    EntryType entryType, size_t prefixLength) {

    size_t blockStart = (offset / checkpointInterval) * checkpointInterval;
    size_t nextCkpt = blockStart + checkpointInterval;

    std::vector<uint8_t> buf;
    bool straddles = (offset < nextCkpt && offset + length > nextCkpt);

    if (straddles) {
        buf.resize(length + checkpointByteLength);
        ssize_t n = ::pread(fd, buf.data(), length + checkpointByteLength, offset);
        if (n < 0 || static_cast<size_t>(n) < length + checkpointByteLength)
            throw std::runtime_error("bytesRead error");

        size_t ckptOffset = nextCkpt - offset;
        std::vector<uint8_t> stitched;
        stitched.reserve(length);
        stitched.insert(stitched.end(), buf.begin(), buf.begin() + ckptOffset);
        stitched.insert(stitched.end(),
                        buf.begin() + ckptOffset + checkpointByteLength,
                        buf.begin() + ckptOffset + checkpointByteLength + (length - ckptOffset));
        buf = std::move(stitched);
    } else {
        buf.resize(length);
        ssize_t n = ::pread(fd, buf.data(), length, offset);
        if (n < 0 || static_cast<size_t>(n) < length)
            throw std::runtime_error("bytesRead error");
    }

    auto entry = EntryFactory::fromU8(buf);
    if (!entry) throw std::runtime_error("Failed to deserialize");

    auto* lle = dynamic_cast<LogLogEntry*>(entry.get());
    if (lle) {
        if (!lle->verify()) throw std::runtime_error("crc verify error");
        if (lle->entryNum() != entryNum) throw std::runtime_error("entryNum mismatch");
    }

    return {std::move(entry), buf.size()};
}
void LogLog::init() {
    PersistedLog::init(
        EntryType::LOG_LOG,
        LOG_LOG_CHECKPOINT_INTERVAL,
        LOG_LOG_CHECKPOINT_BYTE_LENGTH);
}

void LogLog::onInitEntry(uint32_t entryNum, uint32_t offset, uint32_t length,
                          EntryType type, bool isConfig) {
    if (addLogEntry) {
        addLogEntry(entryNum, offset, length);
    }
}

} // namespace logsrd
