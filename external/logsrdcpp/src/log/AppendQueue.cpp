#include "AppendQueue.h"
#include "Log.h"

namespace logsrd {

void AppendQueue::enqueue(std::unique_ptr<GlobalLogEntry> entry, DoneCallback callback) {
    entries_.push_back(Entry{std::move(entry)});
    doneCallback_ = std::move(callback);
}

void AppendQueue::process(Log& log, Persist* persist) {
    if (entries_.empty()) return;

    for (auto& entry : entries_) {
        if (!entry.globalEntry) continue;

        // Write to new hot log
        auto writeOp = new WriteIOOperation(
            std::move(entry.globalEntry),
            [&log, this](IOOperation& op) {
                // On write complete: update stats
                log.stats().addOp(op);
            },
            [&log](IOOperation&) {
                // On write error: stop the log
                log.stop();
            });

        persist->newHotLog()->enqueueOp(writeOp);
    }

    entries_.clear();

    if (doneCallback_) {
        doneCallback_(AppendResult{0, 0});
    }
}

} // namespace logsrd
