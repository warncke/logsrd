#include "CreateLogCommand.h"

namespace logsrd {

CreateLogCommand::CreateLogCommand(JSONCommandTypeArgs args)
    : JSONCommandType([&]() {
        if (args.commandNameU8.empty()) {
            args.commandNameU8 = std::vector<uint8_t>{COMMAND_NAME_BYTE};
        }
        return args;
    }())
{}

} // namespace logsrd
