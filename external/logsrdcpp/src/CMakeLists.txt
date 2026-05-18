# Source files — Phase 1: Foundation & Binary Format
set(ENTRY_SOURCES
    entry/GlobalLogEntry.cpp
    entry/LogLogEntry.cpp
    entry/JSONLogEntry.cpp
    entry/BinaryLogEntry.cpp
    entry/CommandLogEntry.cpp
    entry/GlobalLogCheckpoint.cpp
    entry/LogLogCheckpoint.cpp
    entry/EntryFactory.cpp
    entry/command/JSONCommandType.cpp
    entry/command/CreateLogCommand.cpp
    entry/command/SetConfigCommand.cpp
    entry/command/CommandLogEntryFactory.cpp
)

set(LOG_SOURCES
    log/LogId.cpp
    log/LogIndex.cpp
    log/LogHost.cpp
    log/LogAddress.cpp
)

# Phase 2: Persistence
set(PERSIST_SOURCES
    persist/io/IOQueue.cpp
    persist/io/GlobalLogIOQueue.cpp
    persist/PersistedLog.cpp
    persist/HotLog.cpp
    persist/LogLog.cpp
    persist/Persist.cpp
)

# Phase 3: Log + Server
set(SERVER_SOURCES
    log/LogConfig.cpp
    log/LogStats.cpp
    log/AppendQueue.cpp
    log/Log.cpp
    Server.cpp
)

# In Phase 1, only build entry + log sources
# Full build enables all sources
if(NOT DEFINED LOGSRD_PHASE OR LOGSRD_PHASE EQUAL 1)
    set(SOURCES ${ENTRY_SOURCES} ${LOG_SOURCES})
elseif(LOGSRD_PHASE EQUAL 2)
    set(SOURCES ${ENTRY_SOURCES} ${LOG_SOURCES} ${PERSIST_SOURCES})
else()
    set(SOURCES ${ENTRY_SOURCES} ${LOG_SOURCES} ${PERSIST_SOURCES} ${SERVER_SOURCES})
endif()

add_library(logsrdcpp_core ${SOURCES})

target_include_directories(logsrdcpp_core PUBLIC
    ${CMAKE_CURRENT_SOURCE_DIR}
    ${CMAKE_CURRENT_SOURCE_DIR}/..
    ${UWS_INCLUDE_DIRS}
    ${OPENSSL_INCLUDE_DIR}
)

target_link_libraries(logsrdcpp_core PUBLIC
    OpenSSL::Crypto
    ZLIB::ZLIB
    simdjson::simdjson
)

# Phase 3+ only: link µWebSockets sources
if(LOGSRD_PHASE GREATER_EQUAL 3)
    target_compile_definitions(logsrdcpp_core PRIVATE
        LOGSRD_PHASE=3
        LIBUS_NO_SSL
    )
endif()

if(LOGSRD_PHASE GREATER_EQUAL 3 AND EXISTS "${UWS_DIR}/uSockets/src")
    set(UWS_SOURCES
        ${UWS_DIR}/uSockets/src/bsd.c
        ${UWS_DIR}/uSockets/src/socket.c
        ${UWS_DIR}/uSockets/src/context.c
        ${UWS_DIR}/uSockets/src/loop.c
        ${UWS_DIR}/uSockets/src/eventing/epoll_kqueue.c
    )
    target_sources(logsrdcpp_core PRIVATE ${UWS_SOURCES})
endif()

# Phase 3 executable
if(LOGSRD_PHASE GREATER_EQUAL 3)
    add_executable(logsrdcpp main.cpp)
    target_link_libraries(logsrdcpp PRIVATE logsrdcpp_core Threads::Threads)
endif()
