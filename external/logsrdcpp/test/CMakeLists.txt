add_executable(logsrdcpp_test
    TestGlobals.cpp
    TestEntry.cpp
    TestLogId.cpp
    TestLogIndex.cpp
    TestPersistence.cpp
)

target_link_libraries(logsrdcpp_test PRIVATE
    logsrdcpp_core
    Catch2::Catch2WithMain
)

target_include_directories(logsrdcpp_test PRIVATE ${CMAKE_SOURCE_DIR}/src)

include(CTest)
include(Catch)
catch_discover_tests(logsrdcpp_test)
