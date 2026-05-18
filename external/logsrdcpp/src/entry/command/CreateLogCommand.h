#pragma once
#include "JSONCommandType.h"

namespace logsrd {

class CreateLogCommand : public JSONCommandType {
public:
    static constexpr uint8_t COMMAND_NAME_BYTE = 0x00;

    explicit CreateLogCommand(JSONCommandTypeArgs args);
};

} // namespace logsrd
