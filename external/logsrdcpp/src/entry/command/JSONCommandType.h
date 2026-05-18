#pragma once
#include "../CommandLogEntry.h"
#include <string>

namespace logsrd {

struct JSONCommandTypeArgs {
    std::vector<uint8_t> commandNameU8;
    std::vector<uint8_t> commandValueU8;
    std::string value;
    bool hasValue = false;
};

class JSONCommandType : public CommandLogEntry {
public:
    explicit JSONCommandType(JSONCommandTypeArgs args);

    std::string value() const override;
    void setValue(const std::string& val) override;
};

} // namespace logsrd
