#include "SetConfigCommand.h"

namespace logsrd {

SetConfigCommand::SetConfigCommand(JSONCommandTypeArgs args)
    : JSONCommandType([&]() {
        if (args.commandNameU8.empty()) {
            args.commandNameU8 = std::vector<uint8_t>{COMMAND_NAME_BYTE};
        }
        return args;
    }())
{}

} // namespace logsrd
