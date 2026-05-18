#pragma once
#include "IOOperation.h"
#include <vector>
#include <span>

namespace logsrd {

// Dual read/write queue for a single log file
class IOQueue {
    std::vector<IOOperation*> readQueue_;
    std::vector<IOOperation*> writeQueue_;

public:
    void enqueue(IOOperation* op);
    // Atomically drain both queues and mark ops as processing
    std::pair<std::span<IOOperation*>, std::span<IOOperation*>> getReady();
    // Drain without marking (for cleanup)
    std::pair<std::span<IOOperation*>, std::span<IOOperation*>> drain();
    bool opPending() const;
};

} // namespace logsrd
