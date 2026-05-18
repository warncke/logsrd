#include "JSONCommandType.h"
#include <cstring>

namespace logsrd {

JSONCommandType::JSONCommandType(JSONCommandTypeArgs args)
    : CommandLogEntry(
        std::move(args.commandNameU8),
        args.hasValue
            ? std::vector<uint8_t>(args.value.begin(), args.value.end())
            : std::move(args.commandValueU8))
{}

std::string JSONCommandType::value() const {
    return std::string(commandValueU8.begin(), commandValueU8.end());
}

void JSONCommandType::setValue(const std::string& val) {
    commandValueU8.assign(val.begin(), val.end());
}

} // namespace logsrd
