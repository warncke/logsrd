#pragma once
#include "JSONCommandType.h"

namespace logsrd {

class SetConfigCommand : public JSONCommandType {
public:
    static constexpr uint8_t COMMAND_NAME_BYTE = 0x01;

    explicit SetConfigCommand(JSONCommandTypeArgs args);
};

} // namespace logsrd
