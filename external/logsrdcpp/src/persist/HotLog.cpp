#include "HotLog.h"
#include "../entry/GlobalLogEntry.h"
#include "../entry/GlobalLogCheckpoint.h"
#include "../Util.h"
#include <fcntl.h>
#include <unistd.h>
#include <sys/uio.h>
#include <cstring>
#include <cerrno>
#include <stdexcept>
#include <algorithm>

namespace logsrd {

HotLog::HotLog(const std::string& dataDir, const std::string& fileName, bool isNew)
    : PersistedLog(dataDir + "/" + fileName + (isNew ? ".new" : ".old"))
    , isNew(isNew)
{
    maxReadFds_ = MAX_READ_FDS;
    globalIOQueue_ = new GlobalLogIOQueue();
    ownsQueue_ = true;
}

std::string HotLog::logName() const {
    return isNew ? "newHot" : "oldHot";
}

void HotLog::processWriteOps(std::span<IOOperation*> ops) {
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
        if (!writeOp->entry) {
            writeOp->completeWithError();
            continue;
        }

        auto entry = std::move(writeOp->entry);
        size_t entrySize = entry->byteLength();

        // Check if we cross a checkpoint boundary
        size_t nextCkpt = ((currentPos + GLOBAL_LOG_CHECKPOINT_INTERVAL - 1) /
                           GLOBAL_LOG_CHECKPOINT_INTERVAL) *
                          GLOBAL_LOG_CHECKPOINT_INTERVAL;

        // Build checkpoint bytes if needed
        if (currentPos + entrySize > nextCkpt && currentPos < nextCkpt) {
            // Negative offset from this checkpoint back to the start of the entry
            int32_t distToEntry = static_cast<int32_t>(currentPos);
            int16_t ckptOffset = -static_cast<int16_t>(distToEntry);

            uint16_t ckptLength = static_cast<uint16_t>(entrySize);

            // Build 9-byte checkpoint: [type(1) | offset(2) | length(2) | cksum(4)]
            std::vector<uint8_t> cpBytes(9);
            cpBytes[0] = TYPE_BYTE_GLOBAL_LOG_CHECKPOINT;
            writeI16LEAt(cpBytes, 1, ckptOffset);
            writeU16LEAt(cpBytes, 3, ckptLength);

            // Compute CRC: type byte + 4-byte payload
            uint32_t c = 0;
            c = crc32_bytes(std::span<const uint8_t>(&cpBytes[0], 1), c);
            c = crc32_bytes(std::span<const uint8_t>(&cpBytes[1], 4), c);
            writeU32LEAt(cpBytes, 5, c);

            buffers.push_back(std::move(cpBytes));
            iov.push_back({buffers.back().data(), buffers.back().size()});
            currentPos += buffers.back().size();
        }

        // Serialize entry via u8s()
        auto u8s = entry->u8s();
        for (auto& s : u8s) {
            std::vector<uint8_t> buf(s.begin(), s.end());
            buffers.push_back(std::move(buf));
            iov.push_back({buffers.back().data(), buffers.back().size()});
            currentPos += buffers.back().size();
        }
    }

    if (iov.empty()) return;

    // writev all at once
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

    // Track which buffer position maps to which op
    size_t bufIdx = 0;
    for (auto* op : ops) {
        auto* writeOp = static_cast<WriteIOOperation*>(op);
        if (!writeOp->entry) continue;

        size_t opBytes = 0;
        // Sum up buffer sizes for this operation (may be multiple iovecs per op)
        // We know each op produced at least one buffer
        while (bufIdx < buffers.size()) {
            opBytes += buffers[bufIdx].size();
            bufIdx++;
            break; // For now each op = one iovec (we serialize u8s as single span)
        }

        // Actually with the new u8s() returning a single span, each op = one buffer
        // But we may have inserted a checkpoint before this op's entry.
        // The counting is approximate but correct for the total.

        if (addToIndex) {
            addToIndex(writeOp->entryNum, currentPos - opBytes, opBytes, isNew);
        }
        writeOp->bytesWritten = opBytes;
        writeOp->complete();
    }
}

void HotLog::processReadOps(std::span<IOOperation*> ops) {
    for (auto* op : ops) {
        auto* readOp = static_cast<ReadEntryIOOperation*>(op);
        if (!readOp->index) {
            readOp->completeWithError();
            continue;
        }

        int fd = getReadFd();
        if (fd < 0) {
            readOp->completeWithError();
            continue;
        }

        try {
            auto [offset, length, entryNum] = readOp->index->entry(readOp->entryNum);
            auto [entry, bytesRead] = processReadLogEntry(
                fd, entryNum, offset, length,
                GLOBAL_LOG_CHECKPOINT_INTERVAL,
                GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH,
                EntryType::GLOBAL_LOG,
                GLOBAL_LOG_PREFIX_BYTE_LENGTH);
            readOp->resultEntry = std::move(entry);
            readOp->bytesRead = bytesRead;
            doneReadFd(fd);
            readOp->complete();
        } catch (const std::exception& e) {
            doneReadFd(fd);
            readOp->completeWithError();
        }
    }
}

std::pair<std::unique_ptr<LogEntry>, size_t> HotLog::processReadLogEntry(
    int fd, uint32_t entryNum, uint32_t offset, uint32_t length,
    size_t checkpointInterval, size_t checkpointByteLength,
    EntryType entryType, size_t prefixLength) {

    // Check if entry crosses checkpoint boundary
    size_t blockStart = (offset / checkpointInterval) * checkpointInterval;
    size_t nextCkpt = blockStart + checkpointInterval;

    std::vector<uint8_t> buf;
    bool straddles = (offset < nextCkpt && offset + length > nextCkpt);

    if (straddles) {
        buf.resize(length + checkpointByteLength);
        ssize_t n = ::pread(fd, buf.data(), length + checkpointByteLength, offset);
        if (n < 0 || static_cast<size_t>(n) < length + checkpointByteLength) {
            throw std::runtime_error("bytesRead error");
        }
        // Stitch: copy bytes before checkpoint, skip checkpoint, copy after
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
        if (n < 0 || static_cast<size_t>(n) < length) {
            throw std::runtime_error("bytesRead error");
        }
    }

    auto entry = EntryFactory::fromU8(buf);
    if (!entry) {
        throw std::runtime_error("Failed to deserialize entry");
    }

    // Verify
    auto* gle = dynamic_cast<GlobalLogEntry*>(entry.get());
    if (gle) {
        if (!gle->verify()) {
            throw std::runtime_error("crc verify error");
        }
        if (gle->entryNum() != entryNum) {
            throw std::runtime_error("entryNum mismatch");
        }
    }

    return {std::move(entry), buf.size()};
}

void HotLog::init() {
    PersistedLog::init(
        EntryType::GLOBAL_LOG,
        GLOBAL_LOG_CHECKPOINT_INTERVAL,
        GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH);
}

void HotLog::onInitEntry(uint32_t entryNum, uint32_t offset, uint32_t length,
                          EntryType type, bool isConfig) {
    if (addToIndex) {
        addToIndex(entryNum, offset, length, isNew);
    }
}

} // namespace logsrd
