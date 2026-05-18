#include "GlobalLogIOQueue.h"

namespace logsrd {

void GlobalLogIOQueue::enqueue(IOOperation* op, const std::string& logIdBase64) {
    auto key = logIdBase64.empty() ? std::string(GLOBAL_KEY) : logIdBase64;
    auto it = queues_.find(key);
    if (it == queues_.end()) {
        auto q = std::make_unique<IOQueue>();
        q->enqueue(op);
        queues_[key] = std::move(q);
    } else {
        it->second->enqueue(op);
    }
}

std::unique_ptr<IOQueue> GlobalLogIOQueue::deleteLogQueue(const std::string& logIdBase64) {
    auto it = queues_.find(logIdBase64);
    if (it == queues_.end()) return nullptr;
    auto q = std::move(it->second);
    queues_.erase(it);
    return q;
}

IOQueue* GlobalLogIOQueue::getLogQueue(const std::string& logIdBase64, bool create) {
    if (logIdBase64.empty()) {
        auto it = queues_.find(std::string(GLOBAL_KEY));
        if (it == queues_.end() && create) {
            auto q = std::make_unique<IOQueue>();
            auto* ptr = q.get();
            queues_[std::string(GLOBAL_KEY)] = std::move(q);
            return ptr;
        }
        return it == queues_.end() ? nullptr : it->second.get();
    }
    auto it = queues_.find(logIdBase64);
    if (it == queues_.end() && create) {
        auto q = std::make_unique<IOQueue>();
        auto* ptr = q.get();
        queues_[logIdBase64] = std::move(q);
        return ptr;
    }
    return it == queues_.end() ? nullptr : it->second.get();
}

std::pair<std::vector<IOOperation*>, std::vector<IOOperation*>> GlobalLogIOQueue::getReady() {
    std::vector<IOOperation*> allReads;
    std::vector<IOOperation*> allWrites;

    for (auto& [key, queue] : queues_) {
        auto [reads, writes] = queue->getReady();
        allReads.insert(allReads.end(), reads.begin(), reads.end());
        allWrites.insert(allWrites.end(), writes.begin(), writes.end());
    }

    // Sort by global order
    std::sort(allReads.begin(), allReads.end(),
              [](IOOperation* a, IOOperation* b) { return a->order < b->order; });
    std::sort(allWrites.begin(), allWrites.end(),
              [](IOOperation* a, IOOperation* b) { return a->order < b->order; });

    return {std::move(allReads), std::move(allWrites)};
}

bool GlobalLogIOQueue::opPending() const {
    for (auto& [key, queue] : queues_) {
        if (queue->opPending()) return true;
    }
    return false;
}

} // namespace logsrd
