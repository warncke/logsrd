cmake_minimum_required(VERSION 3.20)
project(logsrdcpp VERSION 0.1.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 23)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# ── Dependencies ──────────────────────────────────────────────
find_package(OpenSSL REQUIRED)
find_package(ZLIB REQUIRED)
find_package(Threads REQUIRED)

# ── simdjson (vendored or fetched) ────────────────────────────
include(FetchContent)
FetchContent_Declare(
    simdjson
    GIT_REPOSITORY https://github.com/simdjson/simdjson.git
    GIT_TAG v3.9.1
)
set(SIMDJSON_DEVELOPER_MODE OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(simdjson)

# ── µWebSockets (header-only, Phase 3+) ──────────────────────
# Include path only; µSockets submodule must be initialized:
#   cd external/uWebSockets && git submodule update --init --recursive
set(UWS_DIR "${CMAKE_SOURCE_DIR}/../uWebSockets")
set(UWS_INCLUDE_DIRS
    ${UWS_DIR}/src
    ${UWS_DIR}/uSockets/src
)

# ── Subdirectories ────────────────────────────────────────────
add_subdirectory(src)

option(BUILD_TESTS "Build test suite" ON)
if(BUILD_TESTS)
    enable_testing()
    find_package(Catch2 QUIET)
    if(NOT Catch2_FOUND)
        FetchContent_Declare(
            Catch2
            GIT_REPOSITORY https://github.com/catchorg/Catch2.git
            GIT_TAG v3.5.2
        )
        FetchContent_MakeAvailable(Catch2)
    endif()
    add_subdirectory(test)
endif()
