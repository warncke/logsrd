#include <iostream>
#include <cstdlib>
#include <string>
#include <memory>
#include <App.h>
#include "Server.h"
#include "Globals.h"

using namespace logsrd;

// Helper: read POST body from uWS
struct PostData {
    std::vector<uint8_t> buffer;
    bool aborted{false};

    static void read(uWS::HttpResponse<false>* res, uWS::HttpRequest* /*req*/,
                     std::function<void(uWS::HttpResponse<false>*, std::span<const uint8_t>)> handler) {
        auto* data = new PostData();

        res->onAborted([data]() {
            data->aborted = true;
            delete data;
        });

        res->onData([data, res, handler = std::move(handler)](std::string_view chunk, bool isLast) {
            if (data->aborted) return;

            data->buffer.insert(data->buffer.end(), chunk.begin(), chunk.end());

            if (data->buffer.size() > MAX_ENTRY_SIZE) {
                res->close();
                delete data;
                return;
            }

            if (isLast) {
                handler(res, std::span<const uint8_t>(data->buffer.data(), data->buffer.size()));
                delete data;
            }
        });
    }
};

int main() {
    Server::ServerConfig config;

    // Parse environment
    if (auto* env = std::getenv("DATA_DIR")) config.dataDir = env;
    if (auto* env = std::getenv("PORT")) config.host = "0.0.0.0:" + std::string(env);
    if (auto* env = std::getenv("HOT_LOG_FILE_NAME")) config.hotLogFileName = env;

    // Parse host:port
    auto colonPos = config.host.find(':');
    std::string host = config.host.substr(0, colonPos);
    int port = 1976;
    if (colonPos != std::string::npos) {
        port = std::stoi(config.host.substr(colonPos + 1));
    }

    std::cout << "logsrdcpp v0.1.0" << std::endl;
    std::cout << "  Data dir: " << config.dataDir << std::endl;

    // Create server
    auto server = std::make_shared<Server>(config);
    server->init();

    std::cout << "  Logs: " << "initialized" << std::endl;

    // uWS App
    uWS::App app;

    // POST /log — createLog
    app.post("/log", [server](auto* res, auto* req) {
        PostData::read(res, req, [server, res](auto*, std::span<const uint8_t> body) {
            std::string bodyStr(reinterpret_cast<const char*>(body.data()), body.size());
            auto result = server->createLog(bodyStr);

            if (result) {
                res->writeStatus("200 OK");
                res->end("{\"status\":\"ok\"}");
            } else {
                res->writeStatus("400 Bad Request");
                res->end("{\"error\":\"" + result.error() + "\"}");
            }
        });
    });

    // POST /log/:logid — appendLog
    app.post("/log/:logid", [server](auto* res, auto* req) {
        std::string logId(req->getParameter("logid"));

        // Parse optional lastEntryNum from query
        std::optional<uint32_t> lastEntryNum;
        auto query = req->getQuery();
        auto lastEntryStr = req->getQuery("lastEntryNum");
        if (!lastEntryStr.empty()) {
            try {
                lastEntryNum = static_cast<uint32_t>(std::stoul(std::string(lastEntryStr)));
            } catch (...) {
                res->writeStatus("400 Bad Request");
                res->end("{\"error\":\"Invalid lastEntryNum\"}");
                return;
            }
        }

        PostData::read(res, req, [server, res, logId, lastEntryNum](auto*, std::span<const uint8_t> body) {
            auto result = server->appendLog(logId, body, lastEntryNum);

            if (result) {
                std::string json = "{\"entryNum\":" + std::to_string(result->entryNum) +
                                  ",\"crc\":" + std::to_string(result->crc) + "}";
                res->writeStatus("200 OK");
                res->end(json);
            } else {
                res->writeStatus("400 Bad Request");
                res->end("{\"error\":\"" + result.error() + "\"}");
            }
        });
    });

    // GET /log/:logid/config
    app.get("/log/:logid/config", [server](auto* res, auto* req) {
        std::string logId(req->getParameter("logid"));
        bool meta = !req->getQuery("meta").empty();

        auto result = server->getConfigJSON(logId, meta);
        if (result) {
            res->writeStatus("200 OK");
            res->end(*result);
        } else {
            res->writeStatus("400 Bad Request");
            res->end("{\"error\":\"" + result.error() + "\"}");
        }
    });

    // PATCH /log/:logid/config
    app.patch("/log/:logid/config", [server](auto* res, auto* req) {
        std::string logId(req->getParameter("logid"));

        auto lastConfigStr = req->getQuery("lastConfigNum");
        if (lastConfigStr.empty()) {
            res->writeStatus("400 Bad Request");
            res->end("{\"error\":\"lastConfigNum required\"}");
            return;
        }

        uint32_t lastConfigNum;
        try {
            lastConfigNum = static_cast<uint32_t>(std::stoul(std::string(lastConfigStr)));
        } catch (...) {
            res->writeStatus("400 Bad Request");
            res->end("{\"error\":\"Invalid lastConfigNum\"}");
            return;
        }

        PostData::read(res, req, [server, res, logId, lastConfigNum](auto*, std::span<const uint8_t> body) {
            std::string bodyStr(reinterpret_cast<const char*>(body.data()), body.size());
            auto result = server->setConfig(logId, bodyStr, lastConfigNum);

            if (result) {
                res->writeStatus("200 OK");
                res->end("{\"status\":\"ok\"}");
            } else {
                res->writeStatus("409 Conflict");
                res->end("{\"error\":\"" + result.error() + "\"}");
            }
        });
    });

    // GET /log/:logid/head
    app.get("/log/:logid/head", [server](auto* res, auto* req) {
        std::string logId(req->getParameter("logid"));
        auto result = server->getHeadJSON(logId);

        if (result) {
            res->writeStatus("200 OK");
            res->end(*result);
        } else {
            res->writeStatus("404 Not Found");
            res->end("{\"error\":\"" + result.error() + "\"}");
        }
    });

    // GET /log/:logid/entries
    app.get("/log/:logid/entries", [server](auto* res, auto* req) {
        std::string logId(req->getParameter("logid"));

        auto offsetStr = req->getQuery("offset");
        auto limitStr = req->getQuery("limit");
        auto entryNumsStr = req->getQuery("entryNums");

        std::optional<uint32_t> offset, limit;
        std::optional<std::vector<uint32_t>> entryNums;

        if (!offsetStr.empty()) {
            try { offset = static_cast<uint32_t>(std::stoul(std::string(offsetStr))); }
            catch (...) {}
        }
        if (!limitStr.empty()) {
            try { limit = static_cast<uint32_t>(std::stoul(std::string(limitStr))); }
            catch (...) {}
        }
        if (!entryNumsStr.empty()) {
            std::vector<uint32_t> nums;
            std::string s(entryNumsStr);
            size_t pos = 0;
            while (pos < s.size()) {
                auto comma = s.find(',', pos);
                auto numStr = (comma == std::string::npos) ? s.substr(pos) : s.substr(pos, comma - pos);
                try { nums.push_back(static_cast<uint32_t>(std::stoul(numStr))); }
                catch (...) {}
                if (comma == std::string::npos) break;
                pos = comma + 1;
            }
            entryNums = std::move(nums);
        }

        auto result = server->getEntriesJSON(logId, offset, limit, entryNums);
        if (result) {
            res->writeStatus("200 OK");
            res->end(*result);
        } else {
            res->writeStatus("400 Bad Request");
            res->end("{\"error\":\"" + result.error() + "\"}");
        }
    });

    // GET /version
    app.get("/version", [](auto* res, auto* /*req*/) {
        res->writeStatus("200 OK");
        res->end("0.0.1");
    });

    // Admin routes
    app.get("/admin/move-new-to-old-hot-log", [server](auto* res, auto* /*req*/) {
        server->persist()->moveNewToOldHotLog();
        res->writeStatus("200 OK");
        res->end("moved");
    });

    app.get("/admin/empty-old-hot-log", [server](auto* res, auto* /*req*/) {
        server->persist()->emptyOldHotLog();
        res->writeStatus("200 OK");
        res->end("emptied");
    });

    // Listen
    app.listen(host, port, [host, port](auto* listenSocket) {
        if (listenSocket) {
            std::cout << "Listening on " << host << ":" << port << std::endl;
        } else {
            std::cerr << "Failed to bind " << host << ":" << port << std::endl;
        }
    });

    std::cout << "Starting event loop..." << std::endl;
    app.run();

    return 0;
}
