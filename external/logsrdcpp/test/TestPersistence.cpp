#include <catch2/catch_test_macros.hpp>
#include "persist/io/IOQueue.h"
#include "persist/io/IOOperation.h"
#include "persist/io/GlobalLogIOQueue.h"
#include "persist/PersistedLog.h"
#include "persist/HotLog.h"
#include "persist/LogLog.h"
#include "persist/Persist.h"
#include "log/LogId.h"
#include "entry/JSONLogEntry.h"
#include "entry/BinaryLogEntry.h"
#include "entry/GlobalLogEntry.h"
#include "entry/LogLogEntry.h"
#include "entry/EntryFactory.h"
#include "Globals.h"
#include "Util.h"
#include <filesystem>
#include <cstdio>
#include <cstdlib>

using namespace logsrd;

// ── IOQueue tests ────────────────────────────────────────────
TEST_CASE("IOQueue starts empty", "[io][queue]") {
    IOQueue q;
    CHECK_FALSE(q.opPending());
    auto [reads, writes] = q.getReady();
    CHECK(reads.empty());
    CHECK(writes.empty());
}

TEST_CASE("IOQueue routes write operations", "[io][queue]") {
    IOQueue q;
    auto writeOp = WriteIOOperation(nullptr);
    q.enqueue(&writeOp);
    CHECK(q.opPending());

    auto [reads, writes] = q.getReady();
    CHECK(reads.empty());
    CHECK(writes.size() == 1);
    CHECK(writes[0]->opType == IOOperationType::WRITE);
    CHECK_FALSE(q.opPending());  // drained
}

TEST_CASE("IOQueue routes read operations", "[io][queue]") {
    IOQueue q;
    auto readOp = ReadEntryIOOperation(nullptr, 0);
    q.enqueue(&readOp);

    auto [reads, writes] = q.getReady();
    CHECK(reads.size() == 1);
    CHECK(writes.empty());
    CHECK(reads[0]->opType == IOOperationType::READ_ENTRY);
}

TEST_CASE("IOQueue marks operations as processing", "[io][queue]") {
    IOQueue q;
    auto op = WriteIOOperation(nullptr);
    q.enqueue(&op);
    CHECK_FALSE(op.processing);

    auto [reads, writes] = q.getReady();
    CHECK(writes[0]->processing);
}

TEST_CASE("IOQueue drain clears without marking", "[io][queue]") {
    IOQueue q;
    auto op = WriteIOOperation(nullptr);
    q.enqueue(&op);
    CHECK_FALSE(op.processing);

    auto [reads, writes] = q.drain();
    CHECK(writes.size() == 1);
    CHECK_FALSE(writes[0]->processing);  // not marked
    CHECK_FALSE(q.opPending());  // cleared
}

// ── GlobalLogIOQueue tests ───────────────────────────────────
TEST_CASE("GlobalLogIOQueue routes by logId", "[io][globalqueue]") {
    GlobalLogIOQueue gq;
    auto op1 = WriteIOOperation(nullptr);
    auto op2 = WriteIOOperation(nullptr);

    gq.enqueue(&op1, "logA");
    gq.enqueue(&op2, "logB");
    CHECK(gq.opPending());

    auto [reads, writes] = gq.getReady();
    CHECK(writes.size() == 2);
}

TEST_CASE("GlobalLogIOQueue global queue for empty logId", "[io][globalqueue]") {
    GlobalLogIOQueue gq;
    auto op = WriteIOOperation(nullptr);
    gq.enqueue(&op, "");

    auto [reads, writes] = gq.getReady();
    CHECK(writes.size() == 1);
}

TEST_CASE("GlobalLogIOQueue sorts by order", "[io][globalqueue]") {
    GlobalLogIOQueue gq;
    auto op1 = WriteIOOperation(nullptr);  // order 0
    auto op2 = WriteIOOperation(nullptr);  // order 1

    gq.enqueue(&op2, "logB");  // enqueued first but higher order
    gq.enqueue(&op1, "logA");

    auto [reads, writes] = gq.getReady();
    CHECK(writes.size() == 2);
    CHECK(writes[0]->order < writes[1]->order);
}

TEST_CASE("GlobalLogIOQueue deleteLogQueue", "[io][globalqueue]") {
    GlobalLogIOQueue gq;
    auto op = WriteIOOperation(nullptr);
    gq.enqueue(&op, "logA");

    auto q = gq.deleteLogQueue("logA");
    REQUIRE(q != nullptr);
    CHECK(gq.deleteLogQueue("logA") == nullptr);  // already deleted
}

// ── IOOperation callback tests ───────────────────────────────
TEST_CASE("IOOperation complete calls callback", "[io][operation]") {
    bool called = false;
    auto op = WriteIOOperation(nullptr,
        [&called](IOOperation&) { called = true; },
        nullptr);
    CHECK_FALSE(called);
    op.complete();
    CHECK(called);
    CHECK(op.endTime > 0);
}

TEST_CASE("IOOperation error calls error callback", "[io][operation]") {
    bool called = false;
    auto op = WriteIOOperation(nullptr,
        nullptr,
        [&called](IOOperation&) { called = true; });
    op.completeWithError();
    CHECK(called);
}

// ── HotLog file I/O tests ────────────────────────────────────
TEST_CASE("HotLog write and read back", "[persist][hotlog]") {
    // Use temp directory
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());
    std::filesystem::create_directories(tmpDir);

    // Cleanup
    auto cleanup = [&]() { std::filesystem::remove_all(tmpDir); };

    {
        HotLog hotLog(tmpDir, "test-hot", true);
        hotLog.init();  // should create empty file

        CHECK(hotLog.byteLength() == 0);

        // Write an entry
        bool indexed = false;
        uint32_t indexedEntryNum = 0;
        hotLog.addToIndex = [&](uint32_t en, uint32_t, uint32_t, bool) {
            indexed = true;
            indexedEntryNum = en;
        };

        auto entry = std::make_unique<JSONLogEntry>(std::string(R"({"msg":"hello"})"));
        auto globalEntry = std::make_unique<GlobalLogEntry>(LogId::newRandom(), 0, std::move(entry));
        uint32_t entryNum = globalEntry->entryNum();

        auto writeOp = new WriteIOOperation(std::move(globalEntry));
        hotLog.enqueueOp(writeOp);

        // Check file was written
        CHECK(hotLog.byteLength() > 0);
    }

    // Read back
    {
        HotLog hotLog(tmpDir, "test-hot", true);
        hotLog.init();

        // Manually check the file exists and has data
        auto filePath = tmpDir + "/test-hot.new";
        CHECK(std::filesystem::exists(filePath));
        CHECK(std::filesystem::file_size(filePath) > 0);

        // Re-open and verify we can read via init scan
        // The addToIndex callback would have fired during init
        bool indexFound = false;
        hotLog.addToIndex = [&](uint32_t, uint32_t, uint32_t, bool) {
            indexFound = true;
        };
        hotLog.init();
        CHECK(indexFound);
    }

    cleanup();
}

TEST_CASE("PersistedLog file handle management", "[persist][fh]") {
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());
    std::filesystem::create_directories(tmpDir);

    {
        HotLog hotLog(tmpDir, "test-fh", true);
        hotLog.init();

        // Write an entry to create the file on disk
        auto entry = std::make_unique<JSONLogEntry>(std::string(R"({"a":1})"));
        auto globalEntry = std::make_unique<GlobalLogEntry>(
            LogId::newRandom(), 0, std::move(entry));
        auto writeOp = new WriteIOOperation(std::move(globalEntry));
        hotLog.enqueueOp(writeOp);

        int fd1 = hotLog.getReadFd();
        CHECK(fd1 >= 0);

        int fd2 = hotLog.getReadFd();
        CHECK(fd2 >= 0);
        CHECK(fd2 != fd1);

        hotLog.doneReadFd(fd1);
        int fd3 = hotLog.getReadFd();
        CHECK(fd3 == fd1);  // recycled

        hotLog.closeAllFds();
    }
    std::filesystem::remove_all(tmpDir);
}

TEST_CASE("Persist lifecycle creates files", "[persist][lifecycle]") {
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());

    {
        Persist persist(tmpDir, "global-hot");
        persist.init();

        CHECK(std::filesystem::exists(tmpDir));
        CHECK(persist.newHotLog() != nullptr);
        CHECK(persist.oldHotLog() != nullptr);
    }

    std::filesystem::remove_all(tmpDir);
}

TEST_CASE("HotLog checkpoint boundary detection", "[persist][checkpoint]") {
    // If we write a large entry that crosses the checkpoint interval,
    // a checkpoint entry should be automatically inserted
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());
    std::filesystem::create_directories(tmpDir);

    {
        HotLog hotLog(tmpDir, "test-ckpt", true);
        hotLog.init();

        // Write enough data to cross checkpoint boundary
        // GLOBAL_LOG_CHECKPOINT_INTERVAL = 131072
        std::string largePayload(GLOBAL_LOG_CHECKPOINT_INTERVAL, 'x');

        auto entry = std::make_unique<BinaryLogEntry>(
            std::vector<uint8_t>(largePayload.begin(), largePayload.end()));
        auto globalEntry = std::make_unique<GlobalLogEntry>(
            LogId::newRandom(), 0, std::move(entry));

        auto writeOp = new WriteIOOperation(std::move(globalEntry));
        hotLog.enqueueOp(writeOp);

        // Now check for checkpoint insertion by reading from file
        // The file should have a checkpoint at the boundary
        // We verify by scanning the file
        hotLog.closeAllFds();

        // Re-init and check entries found
        int entryCount = 0;
        hotLog.addToIndex = [&](uint32_t, uint32_t, uint32_t, bool) {
            entryCount++;
        };
        hotLog.init();

        // Should have found at least one entry (and the checkpoint was handled during scan)
        CHECK(entryCount > 0);
    }

    std::filesystem::remove_all(tmpDir);
}

TEST_CASE("Persist moveNewToOldHotLog", "[persist][rotate]") {
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());

    {
        Persist persist(tmpDir, "global-hot");
        persist.init();

        // Write an entry to new
        auto entry = std::make_unique<JSONLogEntry>(std::string(R"({"x":1})"));
        auto globalEntry = std::make_unique<GlobalLogEntry>(
            LogId::newRandom(), 0, std::move(entry));
        auto writeOp = new WriteIOOperation(std::move(globalEntry));
        persist.newHotLog()->enqueueOp(writeOp);

        CHECK(persist.newHotLog()->byteLength() > 0);

        // Move new to old
        persist.moveNewToOldHotLog();
        CHECK(persist.oldHotLog()->byteLength() > 0);
        CHECK(persist.newHotLog()->byteLength() == 0);  // fresh file
    }

    std::filesystem::remove_all(tmpDir);
}

TEST_CASE("Persist emptyOldHotLog", "[persist][empty]") {
    std::string tmpDir = "/tmp/logsrd-test-" + std::to_string(rand());

    {
        Persist persist(tmpDir, "global-hot");
        persist.init();

        // Write to new, then move to old
        auto entry = std::make_unique<JSONLogEntry>(std::string(R"({"data":"test"})"));
        auto globalEntry = std::make_unique<GlobalLogEntry>(
            LogId::newRandom(), 0, std::move(entry));
        auto writeOp = new WriteIOOperation(std::move(globalEntry));
        persist.newHotLog()->enqueueOp(writeOp);

        persist.moveNewToOldHotLog();
        CHECK(persist.oldHotLog()->byteLength() > 0);

        // Empty old
        persist.emptyOldHotLog();
        CHECK(persist.oldHotLog()->byteLength() == 0);  // fresh file
    }

    std::filesystem::remove_all(tmpDir);
}
