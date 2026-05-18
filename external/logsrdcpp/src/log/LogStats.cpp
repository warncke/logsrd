#include "LogStats.h"
#include "../persist/io/ReadEntryIOOperation.h"
#include "../persist/io/WriteIOOperation.h"

namespace logsrd {

void LogStats::addOp(IOOperation& op) {
    uint64_t opTime = op.endTime - op.startTime;

    switch (op.opType) {
    case IOOperationType::READ_ENTRY:
    case IOOperationType::READ_ENTRIES:
    case IOOperationType::READ_RANGE:
        ioReadTimeAvg = (ioReadTimeAvg * static_cast<double>(ioReads) + static_cast<double>(opTime)) /
                        static_cast<double>(ioReads + 1);
        if (opTime > ioReadTimeMax) ioReadTimeMax = static_cast<double>(opTime);
        ioReadLastTime = op.endTime;
        if (auto* readOp = dynamic_cast<ReadEntryIOOperation*>(&op)) {
            bytesRead += readOp->bytesRead;
        }
        ioReads++;
        break;
    case IOOperationType::WRITE:
        ioWriteTimeAvg = (ioWriteTimeAvg * static_cast<double>(ioWrites) + static_cast<double>(opTime)) /
                         static_cast<double>(ioWrites + 1);
        if (opTime > ioWriteTimeMax) ioWriteTimeMax = static_cast<double>(opTime);
        ioWriteLastTime = op.endTime;
        if (auto* writeOp = dynamic_cast<WriteIOOperation*>(&op)) {
            bytesWritten += writeOp->bytesWritten;
        }
        ioWrites++;
        break;
    }
}

} // namespace logsrd
