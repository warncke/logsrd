#include "CommandLogEntryFactory.h"
#include "CreateLogCommand.h"
#include "SetConfigCommand.h"
#include "../../Globals.h"
#include <stdexcept>

namespace logsrd {

std::unique_ptr<CommandLogEntry> CommandLogEntryFactory::fromU8(
    std::span<const uint8_t> data) {
    if (data.empty() || data[0] != TYPE_BYTE_COMMAND) {
        throw std::runtime_error("Invalid entryType");
    }
    if (data.size() < 2) {
        throw std::runtime_error("Invalid commandName: undefined");
    }

    uint8_t commandName = data[1];
    auto nameBytes = std::vector<uint8_t>{commandName};
    auto valueBytes = std::vector<uint8_t>(data.begin() + 2, data.end());

    JSONCommandTypeArgs args;
    args.commandNameU8 = std::move(nameBytes);
    args.commandValueU8 = std::move(valueBytes);

    switch (static_cast<CommandName>(commandName)) {
    case CommandName::CREATE_LOG:
        return std::make_unique<CreateLogCommand>(std::move(args));
    case CommandName::SET_CONFIG:
        return std::make_unique<SetConfigCommand>(std::move(args));
    default:
        throw std::runtime_error("Invalid commandName: " + std::to_string(commandName));
    }
}

} // namespace logsrd
