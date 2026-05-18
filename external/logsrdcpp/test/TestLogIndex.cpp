#include <catch2/catch_test_macros.hpp>
#include "log/LogIndex.h"

using namespace logsrd;

TEST_CASE("LogIndex initially empty", "[logindex]") {
    LogIndex idx;
    CHECK(idx.entryCount() == 0);
    CHECK_FALSE(idx.hasEntries());
    CHECK_FALSE(idx.hasConfig());
    CHECK_FALSE(idx.hasEntry(0));
}

TEST_CASE("LogIndex addEntry stores triplets", "[logindex]") {
    LogIndex idx;
    idx.addEntry(EntryType::JSON, 0, 100, 50);
    idx.addEntry(EntryType::JSON, 1, 150, 30);

    CHECK(idx.entryCount() == 2);
    CHECK(idx.hasEntries());
    CHECK(idx.hasEntry(0));
    CHECK(idx.hasEntry(1));
    CHECK_FALSE(idx.hasEntry(2));

    auto [en0, off0, len0] = idx.entry(0);
    CHECK(en0 == 0);
    CHECK(off0 == 100);
    CHECK(len0 == 50);

    auto [en1, off1, len1] = idx.entry(1);
    CHECK(en1 == 1);
    CHECK(off1 == 150);
    CHECK(len1 == 30);
}

TEST_CASE("LogIndex throws for out-of-range entry", "[logindex]") {
    LogIndex idx;
    idx.addEntry(EntryType::JSON, 5, 0, 10);
    CHECK_THROWS_AS(idx.entry(0), std::runtime_error);
    CHECK_THROWS_AS(idx.entry(100), std::runtime_error);
}

TEST_CASE("LogIndex byteLength", "[logindex]") {
    LogIndex idx;
    idx.addEntry(EntryType::JSON, 0, 0, 50);
    idx.addEntry(EntryType::JSON, 1, 50, 40);

    // byteLength = sum of (length - prefixByteLength)
    // With prefix=20: (50-20) + (40-20) = 50
    CHECK(idx.byteLength(20) == 50);
    CHECK(idx.byteLength(11) == (50-11) + (40-11));
}

TEST_CASE("GlobalLogIndex byteLength uses global prefix", "[logindex]") {
    GlobalLogIndex idx;
    idx.addEntry(EntryType::GLOBAL_LOG, 0, 0, 50 + GLOBAL_LOG_PREFIX_BYTE_LENGTH);
    CHECK(idx.byteLength() == 50);
}

TEST_CASE("LogLogIndex byteLength uses log prefix", "[logindex]") {
    LogLogIndex idx;
    idx.addEntry(EntryType::LOG_LOG, 0, 0, 50 + LOG_LOG_PREFIX_BYTE_LENGTH);
    CHECK(idx.byteLength() == 50);
}

TEST_CASE("LogIndex lastEntry and maxEntryNum", "[logindex]") {
    LogIndex idx;
    CHECK_THROWS_AS(idx.lastEntry(), std::runtime_error);
    CHECK_THROWS_AS(idx.maxEntryNum(), std::runtime_error);

    idx.addEntry(EntryType::JSON, 0, 10, 20);
    idx.addEntry(EntryType::JSON, 1, 30, 40);

    auto [en, off, len] = idx.lastEntry();
    CHECK(en == 1);
    CHECK(off == 30);
    CHECK(len == 40);
    CHECK(idx.maxEntryNum() == 1);
}

TEST_CASE("LogIndex appendIndex merges correctly", "[logindex]") {
    LogIndex idx1;
    idx1.addEntry(EntryType::JSON, 0, 0, 10);
    idx1.addEntry(EntryType::JSON, 1, 10, 20);

    LogIndex idx2;
    idx2.addEntry(EntryType::JSON, 2, 30, 30);

    idx1.appendIndex(idx2);
    CHECK(idx1.entryCount() == 3);
    CHECK(idx1.maxEntryNum() == 2);
}

TEST_CASE("LogIndex config tracking", "[logindex]") {
    // Config tracking via 5-param addEntry
    LogIndex idx;
    CHECK_FALSE(idx.hasConfig());

    idx.addEntry(EntryType::COMMAND, 0, 0, 10, true);
    CHECK(idx.hasConfig());

    auto [num, off, len] = idx.lastConfig();
    CHECK(num == 0);
    CHECK(off == 0);
    CHECK(len == 10);

    // Later config entry replaces
    idx.addEntry(EntryType::COMMAND, 5, 100, 20, true);
    auto [num2, off2, len2] = idx.lastConfig();
    CHECK(num2 == 5);
    CHECK(off2 == 100);
    CHECK(len2 == 20);

    // Non-config entry doesn't change config
    idx.addEntry(EntryType::JSON, 6, 120, 15, false);
    auto [num3, off3, len3] = idx.lastConfig();
    CHECK(num3 == 5);  // unchanged
}
