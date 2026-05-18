#pragma once
#include <cstdint>
#include "../persist/io/IOOperation.h"
#include "../Globals.h"

namespace logsrd {

struct LogStats {
    uint64_t ioReads{0};
    uint64_t bytesRead{0};
    double ioReadTimeAvg{0};
    double ioReadTimeMax{0};
    uint64_t ioReadLastTime{0};

    uint64_t ioWrites{0};
    uint64_t bytesWritten{0};
    double ioWriteTimeAvg{0};
    double ioWriteTimeMax{0};
    uint64_t ioWriteLastTime{0};

    void addOp(IOOperation& op);
};

} // namespace logsrd
