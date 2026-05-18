#pragma once
#include <cstdint>
#include <functional>
#include <chrono>
#include <atomic>
#include "../../Globals.h"

namespace logsrd {

class IOOperation {
public:
    using CompleteCallback = std::function<void(IOOperation&)>;

    IOOperationType opType;
    uint64_t order;
    uint64_t startTime;
    uint64_t endTime{0};
    bool processing{false};

    CompleteCallback onComplete;
    CompleteCallback onError;

    IOOperation(IOOperationType type,
                CompleteCallback onComplete = nullptr,
                CompleteCallback onError = nullptr)
        : opType(type)
        , order(nextOrder())
        , startTime(now())
        , onComplete(std::move(onComplete))
        , onError(std::move(onError))
    {}

    virtual ~IOOperation() = default;

    void complete() {
        endTime = now();
        if (onComplete) onComplete(*this);
    }

    void completeWithError() {
        endTime = now();
        if (onError) onError(*this);
    }

private:
    static uint64_t nextOrder() {
        static std::atomic<uint64_t> counter{0};
        return counter++;
    }

    static uint64_t now() {
        return std::chrono::duration_cast<std::chrono::milliseconds>(
            std::chrono::steady_clock::now().time_since_epoch()).count();
    }
};

} // namespace logsrd
