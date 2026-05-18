#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_vector.hpp>
#include <array>
#include <algorithm>
#include "entry/LogEntry.h"
#include "entry/GlobalLogEntry.h"
#include "entry/LogLogEntry.h"
#include "entry/JSONLogEntry.h"
#include "entry/BinaryLogEntry.h"
#include "entry/CommandLogEntry.h"
#include "entry/GlobalLogCheckpoint.h"
#include "entry/LogLogCheckpoint.h"
#include "entry/EntryFactory.h"
#include "entry/command/CreateLogCommand.h"
#include "entry/command/SetConfigCommand.h"
#include "log/LogId.h"
#include "Globals.h"
#include "Util.h"
#include "log/LogHost.h"
#include "log/LogAddress.h"

using namespace logsrd;
using namespace Catch::Matchers;

// ── Test data ─────────────────────────────────────────────────
// 16 zero bytes
auto makeTestId(uint8_t fill = 0) {
    std::array<uint8_t, 16> arr;
    std::fill(arr.begin(), arr.end(), fill);
    return LogId::fromBytes(std::span<const uint8_t, 16>(arr));
}
auto testLogId = makeTestId(0);
auto testLogId2 = makeTestId(0xBB);

// ── Helper: concatenate u8s() into a single buffer ───────────
std::vector<uint8_t> concatU8s(const LogEntry& entry) {
    auto parts = entry.u8s();
    std::vector<uint8_t> result;
    for (auto& part : parts) {
        result.insert(result.end(), part.begin(), part.end());
    }
    return result;
}

// ── GlobalLogEntry tests ─────────────────────────────────────
TEST_CASE("GlobalLogEntry prefix has correct byte length", "[entry][global]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({"a":1})");
    auto gle = GlobalLogEntry(testLogId, 0, std::move(inner));

    CHECK(gle.byteLength() == 27 + 8);  // 27 prefix + 8 bytes for '{"a":1}'
    CHECK(gle.type() == EntryType::GLOBAL_LOG);
    CHECK(gle.entryNum() == 0);
    CHECK(gle.logId() == testLogId);
}

TEST_CASE("GlobalLogEntry prefixU8 is 27 bytes with correct layout", "[entry][global]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({"a":1})");
    auto gle = GlobalLogEntry(testLogId, 42, std::move(inner));

    auto& prefix = gle.prefixU8();
    CHECK(prefix.size() == 27);

    // Byte 0: type byte
    CHECK(prefix[0] == TYPE_BYTE_GLOBAL_LOG);

    // Bytes 1-16: LogId
    auto idBytes = testLogId.bytes();
    for (int i = 0; i < 16; i++) {
        CHECK(prefix[1 + i] == idBytes[i]);
    }

    // Bytes 17-20: entryNum = 42 (LE)
    CHECK(prefix[17] == 42);
    CHECK(prefix[18] == 0);
    CHECK(prefix[19] == 0);
    CHECK(prefix[20] == 0);

    // JSONLogEntry("{\"a\":1}") has byteLength = 1 (type) + 7 (payload) = 8
    uint16_t length = readU16LE(prefix, 21);
    CHECK(length == 8);

    // EntryNum from prefix via fromU8 should match
    auto fromU8 = EntryFactory::fromU8(concatU8s(gle));
    REQUIRE(fromU8 != nullptr);
    CHECK(fromU8->type() == EntryType::GLOBAL_LOG);
    auto* gle2 = dynamic_cast<GlobalLogEntry*>(fromU8.get());
    REQUIRE(gle2 != nullptr);
    CHECK(gle2->entryNum() == 42);
}

TEST_CASE("GlobalLogEntry round-trip via fromU8", "[entry][global]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({"hello":"world"})");
    auto gle = GlobalLogEntry(testLogId, 7, std::move(inner));

    auto bytes = concatU8s(gle);
    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::GLOBAL_LOG);
    CHECK(parsed->byteLength() == gle.byteLength());

    auto* pGle = dynamic_cast<GlobalLogEntry*>(parsed.get());
    REQUIRE(pGle != nullptr);
    CHECK(pGle->entryNum() == 7);
    CHECK(pGle->logId() == testLogId);
}

TEST_CASE("GlobalLogEntry CRC computation and verification", "[entry][global]") {
    auto inner = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{1, 2, 3, 4});
    auto gle = GlobalLogEntry(testLogId, 0, std::move(inner));

    // CRC stored as 0 initially → verify returns false
    CHECK_FALSE(gle.verify());

    // Compute CRC
    uint32_t crc = gle.cksum(0);
    CHECK(crc != 0);

    // Construct with correct CRC → verify passes
    auto inner2 = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{1, 2, 3, 4});
    auto gle2 = GlobalLogEntry(testLogId, 0, std::move(inner2), crc);
    CHECK(gle2.verify());

    // Wrong CRC → verify fails
    auto inner3 = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{1, 2, 3, 4});
    auto gle3 = GlobalLogEntry(testLogId, 0, std::move(inner3), crc + 1);
    CHECK_FALSE(gle3.verify());
}

TEST_CASE("GlobalLogEntry key format", "[entry][global]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({})");
    auto gle = GlobalLogEntry(testLogId, 42, std::move(inner));
    CHECK(gle.key() == testLogId.base64() + "-42");
}

// ── LogLogEntry tests ────────────────────────────────────────
TEST_CASE("LogLogEntry prefix has correct byte length", "[entry][loglog]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({"a":1})");
    auto lle = LogLogEntry(5, std::move(inner));

    // inner JSONLogEntry("{\"a\":1}") has byteLength = 8
    CHECK(lle.byteLength() == 11 + 8);
    CHECK(lle.type() == EntryType::LOG_LOG);
    CHECK(lle.entryNum() == 5);
}

TEST_CASE("LogLogEntry prefixU8 is 11 bytes with correct layout", "[entry][loglog]") {
    auto inner = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{0xAB, 0xCD});
    auto lle = LogLogEntry(99, std::move(inner));

    auto& prefix = lle.prefixU8();
    CHECK(prefix.size() == 11);
    CHECK(prefix[0] == TYPE_BYTE_LOG_LOG);

    uint32_t entryNum = readU32LE(prefix, 1);
    CHECK(entryNum == 99);

    uint16_t length = readU16LE(prefix, 5);
    CHECK(length == 3);  // 1 type byte + 2 payload bytes
}

TEST_CASE("LogLogEntry round-trip via fromU8", "[entry][loglog]") {
    auto inner = std::make_unique<JSONLogEntry>(R"({"x":1})");
    auto lle = LogLogEntry(42, std::move(inner));

    auto bytes = concatU8s(lle);
    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::LOG_LOG);

    auto* pLle = dynamic_cast<LogLogEntry*>(parsed.get());
    REQUIRE(pLle != nullptr);
    CHECK(pLle->entryNum() == 42);
}

TEST_CASE("LogLogEntry CRC verification", "[entry][loglog]") {
    auto inner = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{0x01, 0x02});
    auto lle = LogLogEntry(0, std::move(inner));
    CHECK_FALSE(lle.verify());

    uint32_t crc = lle.cksum(0);
    auto inner2 = std::make_unique<BinaryLogEntry>(std::vector<uint8_t>{0x01, 0x02});
    auto lle2 = LogLogEntry(0, std::move(inner2), crc);
    CHECK(lle2.verify());
}

// ── JSONLogEntry tests ───────────────────────────────────────
TEST_CASE("JSONLogEntry construction and access", "[entry][json]") {
    auto jle = JSONLogEntry(std::string(R"({"key":"val"})"));
    CHECK(jle.type() == EntryType::JSON);
    CHECK(jle.str() == R"({"key":"val"})");
    CHECK_FALSE(jle.u8().empty());
}

TEST_CASE("JSONLogEntry round-trip", "[entry][json]") {
    auto jle = JSONLogEntry(std::string(R"({"a":1,"b":"two"})"));
    auto bytes = concatU8s(jle);
    CHECK(bytes[0] == TYPE_BYTE_JSON);

    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::JSON);
}

TEST_CASE("JSONLogEntry byteLength", "[entry][json]") {
    auto jle = JSONLogEntry(std::string("abc"));
    CHECK(jle.byteLength() == 4);  // 1 type + 3 payload
}

// ── BinaryLogEntry tests ─────────────────────────────────────
TEST_CASE("BinaryLogEntry construction and access", "[entry][binary]") {
    std::vector<uint8_t> data = {0xDE, 0xAD, 0xBE, 0xEF};
    auto ble = BinaryLogEntry(data);
    CHECK(ble.type() == EntryType::BINARY);
    CHECK(ble.u8() == data);
    CHECK(ble.byteLength() == 5);  // 1 type + 4 payload
}

TEST_CASE("BinaryLogEntry round-trip", "[entry][binary]") {
    std::vector<uint8_t> data = {0x01, 0x02, 0x03, 0x04, 0x05};
    auto ble = BinaryLogEntry(data);
    auto bytes = concatU8s(ble);
    CHECK(bytes[0] == TYPE_BYTE_BINARY);

    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::BINARY);
}

// ── CommandLogEntry tests ────────────────────────────────────
TEST_CASE("CommandLogEntry construction", "[entry][command]") {
    auto cmd = CommandLogEntry(
        std::vector<uint8_t>{0x00},
        std::vector<uint8_t>{0x7B, 0x7D}  // "{}"
    );
    CHECK(cmd.type() == EntryType::COMMAND);
    CHECK(cmd.byteLength() == 4);  // 2 fixed + 2 payload
    CHECK_THROWS_AS(cmd.value(), std::runtime_error);  // base class throws
}

TEST_CASE("CommandLogEntry u8s format", "[entry][command]") {
    auto cmd = CommandLogEntry(
        std::vector<uint8_t>{0x01},
        std::vector<uint8_t>{0x01, 0x02, 0x03}
    );
    auto bytes = concatU8s(cmd);
    CHECK(bytes.size() == 5);  // 1 type + 1 name + 3 value
    CHECK(bytes[0] == TYPE_BYTE_COMMAND);
    CHECK(bytes[1] == 0x01);
    CHECK(bytes[2] == 0x01);
    CHECK(bytes[3] == 0x02);
    CHECK(bytes[4] == 0x03);
}

// ── CreateLogCommand tests ───────────────────────────────────
TEST_CASE("CreateLogCommand sets command byte 0x00", "[entry][create]") {
    auto cmd = CreateLogCommand(JSONCommandTypeArgs{
        .commandNameU8 = {},
        .commandValueU8 = {},
        .value = R"({"type":"json"})",
        .hasValue = true,
    });
    CHECK_FALSE(cmd.commandNameU8.empty());
    CHECK(cmd.commandNameU8[0] == 0x00);
    CHECK(cmd.value().find("type") != std::string::npos);
}

// ── SetConfigCommand tests ───────────────────────────────────
TEST_CASE("SetConfigCommand sets command byte 0x01", "[entry][setconfig]") {
    auto cmd = SetConfigCommand(JSONCommandTypeArgs{
        .commandNameU8 = {},
        .commandValueU8 = {},
        .value = R"({"key":"maxSize","value":4096})",
        .hasValue = true,
    });
    CHECK_FALSE(cmd.commandNameU8.empty());
    CHECK(cmd.commandNameU8[0] == 0x01);
}

// ── Checkpoint tests ─────────────────────────────────────────
TEST_CASE("GlobalLogCheckpoint byte layout", "[entry][checkpoint]") {
    auto cp = GlobalLogCheckpoint(-100, 50);
    CHECK(cp.byteLength() == 9);
    CHECK(cp.type() == EntryType::GLOBAL_LOG_CHECKPOINT);
    CHECK(cp.lastEntryOffset() == -100);
    CHECK(cp.lastEntryLength() == 50);
    CHECK_FALSE(cp.verify());  // crc = 0

    // Round-trip
    auto bytes = concatU8s(cp);
    CHECK(bytes.size() == 9);
    CHECK(bytes[0] == TYPE_BYTE_GLOBAL_LOG_CHECKPOINT);

    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::GLOBAL_LOG_CHECKPOINT);
    auto* pCp = dynamic_cast<GlobalLogCheckpoint*>(parsed.get());
    REQUIRE(pCp != nullptr);
    CHECK(pCp->lastEntryOffset() == -100);
    CHECK(pCp->lastEntryLength() == 50);
}

TEST_CASE("LogLogCheckpoint byte layout", "[entry][checkpoint]") {
    auto cp = LogLogCheckpoint(-200, 75, 12345);
    CHECK(cp.byteLength() == 13);
    CHECK(cp.type() == EntryType::LOG_LOG_CHECKPOINT);
    CHECK(cp.lastEntryOffset() == -200);
    CHECK(cp.lastEntryLength() == 75);
    CHECK(cp.lastConfigOffset() == 12345);

    // Round-trip
    auto bytes = concatU8s(cp);
    CHECK(bytes.size() == 13);
    CHECK(bytes[0] == TYPE_BYTE_LOG_LOG_CHECKPOINT);

    auto parsed = EntryFactory::fromU8(bytes);
    REQUIRE(parsed != nullptr);
    CHECK(parsed->type() == EntryType::LOG_LOG_CHECKPOINT);
    auto* pCp = dynamic_cast<LogLogCheckpoint*>(parsed.get());
    REQUIRE(pCp != nullptr);
    CHECK(pCp->lastEntryOffset() == -200);
    CHECK(pCp->lastEntryLength() == 75);
    CHECK(pCp->lastConfigOffset() == 12345);
}

TEST_CASE("Checkpoint CRC verification", "[entry][checkpoint]") {
    auto cp = GlobalLogCheckpoint(-50, 100);
    CHECK_FALSE(cp.verify());

    uint32_t crc = cp.cksum(0);
    auto cp2 = GlobalLogCheckpoint(-50, 100, crc);
    CHECK(cp2.verify());

    auto cp3 = GlobalLogCheckpoint(-50, 100, crc + 1);
    CHECK_FALSE(cp3.verify());
}

// ── EntryFactory tests ───────────────────────────────────────
TEST_CASE("EntryFactory unknown type throws", "[entry][factory]") {
    std::vector<uint8_t> buf = {0xFF};
    CHECK_THROWS_AS(EntryFactory::fromU8(buf), std::runtime_error);
}

TEST_CASE("EntryFactory empty input throws", "[entry][factory]") {
    CHECK_THROWS_AS(EntryFactory::fromU8({}), std::runtime_error);
}

TEST_CASE("EntryFactory fromPartialU8 empty returns needBytes", "[entry][factory]") {
    auto result = EntryFactory::fromPartialU8({});
    CHECK(result.entry == nullptr);
    CHECK(result.needBytes == 1);
    CHECK(result.err.empty());
}

TEST_CASE("EntryFactory fromPartialU8 truncated global log returns needBytes", "[entry][factory]") {
    // Just the type byte, not enough for 27-byte prefix
    std::vector<uint8_t> buf = {TYPE_BYTE_GLOBAL_LOG};
    auto result = EntryFactory::fromPartialU8(buf);
    CHECK(result.needBytes > 0);
}

TEST_CASE("EntryFactory fromPartialU8 unknown type returns error", "[entry][factory]") {
    std::vector<uint8_t> buf = {0xFF};
    auto result = EntryFactory::fromPartialU8(buf);
    CHECK_FALSE(result.err.empty());
}

// ── CRC32 utility tests ──────────────────────────────────────
TEST_CASE("CRC32 produces non-zero result", "[util][crc]") {
    std::vector<uint8_t> data = {'h', 'e', 'l', 'l', 'o'};
    uint32_t c = crc32_bytes(data);
    CHECK(c != 0);
}

TEST_CASE("base64url encoding matches expected format", "[util][base64]") {
    std::vector<uint8_t> data = {'h', 'e', 'l', 'l', 'o'};
    auto encoded = base64urlEncode(data);
    CHECK_FALSE(encoded.empty());
    CHECK(encoded.find('=') == std::string::npos);
    CHECK(encoded.find('+') == std::string::npos);
    CHECK(encoded.find('/') == std::string::npos);
}

TEST_CASE("base64url round-trip", "[util][base64]") {
    std::vector<uint8_t> original = {0xDE, 0xAD, 0xBE, 0xEF, 0x00, 0xFF, 0x12, 0x34};
    auto encoded = base64urlEncode(original);
    auto decoded = base64urlDecode(encoded);
    CHECK(decoded == original);
}

// ── LogHost tests ────────────────────────────────────────────
TEST_CASE("LogHost fromString and toString", "[log][host]") {
    auto host = LogHost::fromString("10.0.0.1:7000,10.0.0.2:7000,10.0.0.3:7000");
    CHECK(host.master == "10.0.0.1:7000");
    CHECK(host.replicas.size() == 2);
    CHECK(host.replicas[0] == "10.0.0.2:7000");
    CHECK(host.replicas[1] == "10.0.0.3:7000");
    CHECK(host.toString() == "10.0.0.1:7000,10.0.0.2:7000,10.0.0.3:7000");
}

TEST_CASE("LogHost single entry (master only)", "[log][host]") {
    auto host = LogHost::fromString("localhost:7000");
    CHECK(host.master == "localhost:7000");
    CHECK(host.replicas.empty());
}

// ── LogAddress tests ─────────────────────────────────────────
TEST_CASE("LogAddress fromString and toString", "[log][address]") {
    auto addr = LogAddress::fromString(
        "AAAAAAAAAAAAAAAAAAAAAA;10.0.0.1:7000,rep1;cfg1,cfgrep");
    CHECK(addr.logIdBase64 == "AAAAAAAAAAAAAAAAAAAAAA");
    REQUIRE(addr.host.has_value());
    CHECK(addr.host->master == "10.0.0.1:7000");
    CHECK(addr.host->replicas[0] == "rep1");
    CHECK(addr.config.size() == 1);
    CHECK(addr.config[0].master == "cfg1");
    CHECK(addr.config[0].replicas[0] == "cfgrep");
    CHECK(addr.toString() ==
          "AAAAAAAAAAAAAAAAAAAAAA;10.0.0.1:7000,rep1;cfg1,cfgrep");
}

TEST_CASE("LogAddress with only logId", "[log][address]") {
    std::string b64 = "AAAAAAAAAAAAAAAAAAAAAA";
    auto addr = LogAddress::fromString(b64);
    CHECK(addr.logIdBase64 == b64);
    CHECK_FALSE(addr.host.has_value());
    CHECK(addr.config.empty());
}

TEST_CASE("LogAddress throws on too-short input", "[log][address]") {
    CHECK_THROWS_AS(LogAddress::fromString("short"), std::runtime_error);
}
