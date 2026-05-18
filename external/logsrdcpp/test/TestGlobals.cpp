#include <catch2/catch_test_macros.hpp>
#include "Globals.h"

using namespace logsrd;

TEST_CASE("Constants match Node.js values", "[globals]") {
    CHECK(GLOBAL_LOG_PREFIX_BYTE_LENGTH == 27);
    CHECK(LOG_LOG_PREFIX_BYTE_LENGTH == 11);
    CHECK(GLOBAL_LOG_CHECKPOINT_BYTE_LENGTH == 9);
    CHECK(LOG_LOG_CHECKPOINT_BYTE_LENGTH == 13);
    CHECK(GLOBAL_LOG_CHECKPOINT_INTERVAL == 131072);
    CHECK(LOG_LOG_CHECKPOINT_INTERVAL == 131072);
    CHECK(MAX_ENTRY_SIZE == 32768);
    CHECK(MAX_LOG_SIZE == 16777216);
    CHECK(MAX_RESPONSE_ENTRIES == 100);
    CHECK(DEFAULT_HOT_LOG_FILE_NAME == "global-hot.log");
}

TEST_CASE("EntryType enum values match Node.js", "[globals]") {
    CHECK(static_cast<uint8_t>(EntryType::GLOBAL_LOG) == 0);
    CHECK(static_cast<uint8_t>(EntryType::LOG_LOG) == 1);
    CHECK(static_cast<uint8_t>(EntryType::GLOBAL_LOG_CHECKPOINT) == 2);
    CHECK(static_cast<uint8_t>(EntryType::LOG_LOG_CHECKPOINT) == 3);
    CHECK(static_cast<uint8_t>(EntryType::COMMAND) == 4);
    CHECK(static_cast<uint8_t>(EntryType::BINARY) == 5);
    CHECK(static_cast<uint8_t>(EntryType::JSON) == 6);
}

TEST_CASE("CommandName enum values match Node.js", "[globals]") {
    CHECK(static_cast<uint8_t>(CommandName::CREATE_LOG) == 0);
    CHECK(static_cast<uint8_t>(CommandName::SET_CONFIG) == 1);
}

TEST_CASE("Type byte constants match", "[globals]") {
    CHECK(TYPE_BYTE_GLOBAL_LOG == 0x00);
    CHECK(TYPE_BYTE_LOG_LOG == 0x01);
    CHECK(TYPE_BYTE_GLOBAL_LOG_CHECKPOINT == 0x02);
    CHECK(TYPE_BYTE_LOG_LOG_CHECKPOINT == 0x03);
    CHECK(TYPE_BYTE_COMMAND == 0x04);
    CHECK(TYPE_BYTE_BINARY == 0x05);
    CHECK(TYPE_BYTE_JSON == 0x06);
}

TEST_CASE("Protected properties list", "[globals]") {
    CHECK(PROTECTED_PROPERTIES.size() == 7);
    CHECK(PROTECTED_PROPERTIES[0] == "accessToken");
    CHECK(PROTECTED_PROPERTIES[6] == "jwtSecret");
}
