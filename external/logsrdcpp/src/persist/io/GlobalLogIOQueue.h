#pragma once
#include "IOQueue.h"
#include <string>
#include <unordered_map>
#include <memory>
#include <algorithm>

namespace logsrd {

// Per-log partitioned queue with global ordering
class GlobalLogIOQueue {
    std::unordered_map<std::string, std::unique_ptr<IOQueue>> queues_;
    static constexpr std::string_view GLOBAL_KEY = "__global__";

public:
    void enqueue(IOOperation* op, const std::string& logIdBase64 = "");
    std::unique_ptr<IOQueue> deleteLogQueue(const std::string& logIdBase64);
    IOQueue* getLogQueue(const std::string& logIdBase64, bool create = true);

    // Collects from all queues, globally sorts by order, returns read/write ops
    std::pair<std::vector<IOOperation*>, std::vector<IOOperation*>> getReady();
    bool opPending() const;
};

} // namespace logsrd
