#include "IOQueue.h"

namespace logsrd {

void IOQueue::enqueue(IOOperation* op) {
    if (op->opType == IOOperationType::WRITE) {
        writeQueue_.push_back(op);
    } else {
        readQueue_.push_back(op);
    }
}

std::pair<std::span<IOOperation*>, std::span<IOOperation*>> IOQueue::getReady() {
    // Mark all ops as processing
    for (auto* op : readQueue_) op->processing = true;
    for (auto* op : writeQueue_) op->processing = true;

    auto result = std::pair(
        std::span<IOOperation*>(readQueue_.data(), readQueue_.size()),
        std::span<IOOperation*>(writeQueue_.data(), writeQueue_.size())
    );

    readQueue_.clear();
    writeQueue_.clear();
    return result;
}

std::pair<std::span<IOOperation*>, std::span<IOOperation*>> IOQueue::drain() {
    auto result = std::pair(
        std::span<IOOperation*>(readQueue_.data(), readQueue_.size()),
        std::span<IOOperation*>(writeQueue_.data(), writeQueue_.size())
    );
    readQueue_.clear();
    writeQueue_.clear();
    return result;
}

bool IOQueue::opPending() const {
    return !readQueue_.empty() || !writeQueue_.empty();
}

} // namespace logsrd
