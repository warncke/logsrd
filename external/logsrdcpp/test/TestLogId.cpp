#include <catch2/catch_test_macros.hpp>
#include "log/LogId.h"
#include "Util.h"
#include <array>
#include <algorithm>

using namespace logsrd;

TEST_CASE("LogId::newRandom produces 16 bytes", "[logid]") {
    auto id = LogId::newRandom();
    CHECK(id.byteLength() == 16);
    CHECK(id.bytes().size() == 16);
}

TEST_CASE("LogId::base64 round-trips", "[logid]") {
    auto id = LogId::newRandom();
    auto b64 = id.base64();
    CHECK_FALSE(b64.empty());
    CHECK(b64.size() == 22);  // 16 bytes → 22 base64url chars without padding

    auto decoded = LogId::fromBase64(b64);
    CHECK(decoded == id);
    CHECK(decoded.base64() == b64);  // caching

    // Verify base64url charset (no +, /, or =)
    CHECK(b64.find('+') == std::string::npos);
    CHECK(b64.find('/') == std::string::npos);
    CHECK(b64.find('=') == std::string::npos);
}

TEST_CASE("LogId::fromBytes preserves exact bytes", "[logid]") {
    auto id = LogId::newRandom();
    auto bytes = id.bytes();
    std::array<uint8_t, 16> arr;
    std::copy(bytes.begin(), bytes.end(), arr.begin());
    auto fromBytes = LogId::fromBytes(std::span<const uint8_t, 16>(arr));
    CHECK(fromBytes == id);
}

TEST_CASE("LogId::logDirPrefix format", "[logid]") {
    auto id = LogId::newRandom();
    auto prefix = id.logDirPrefix();
    CHECK(prefix.size() == 5);  // "XX/YY"
    CHECK(prefix[2] == '/');
    // Verify hex characters
    CHECK(std::isxdigit(prefix[0]));
    CHECK(std::isxdigit(prefix[1]));
    CHECK(std::isxdigit(prefix[3]));
    CHECK(std::isxdigit(prefix[4]));
}

TEST_CASE("LogId unique generation", "[logid]") {
    auto id1 = LogId::newRandom();
    auto id2 = LogId::newRandom();
    CHECK(id1 != id2);
}

TEST_CASE("LogId::base64 is cached", "[logid]") {
    auto id = LogId::newRandom();
    auto b64_1 = id.base64();
    auto b64_2 = id.base64();
    CHECK(b64_1 == b64_2);
}

TEST_CASE("LogId::logDirPrefix is cached", "[logid]") {
    auto id = LogId::newRandom();
    auto p1 = id.logDirPrefix();
    auto p2 = id.logDirPrefix();
    CHECK(p1 == p2);
}
