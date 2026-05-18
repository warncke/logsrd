#pragma once
#include <cstdint>
#include <span>
#include <string>
#include <vector>
#include <stdexcept>
#include <cstring>
#include <zlib.h>
#include <openssl/rand.h>
#include <openssl/bio.h>
#include <openssl/evp.h>
#include <openssl/buffer.h>

namespace logsrd {

// ── CRC32 (zlib, matches @node-rs/crc32) ──────────────────────
inline uint32_t crc32_bytes(std::span<const uint8_t> data, uint32_t seed = 0) {
    return crc32(seed, reinterpret_cast<const Bytef*>(data.data()), data.size());
}

inline uint32_t crc32_combine(std::initializer_list<std::span<const uint8_t>> parts) {
    uint32_t c = 0;
    for (auto& part : parts) {
        c = crc32_bytes(part, c);
    }
    return c;
}

// ── base64url (matches Node.js Buffer.toString("base64url")) ──
inline std::string base64urlEncode(std::span<const uint8_t> data) {
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO* mem = BIO_new(BIO_s_mem());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    b64 = BIO_push(b64, mem);
    BIO_write(b64, data.data(), static_cast<int>(data.size()));
    (void)BIO_flush(b64);

    BUF_MEM* buf = nullptr;
    BIO_get_mem_ptr(b64, &buf);

    std::string result(buf->data, buf->length);

    // Strip any trailing newline
    while (!result.empty() && (result.back() == '\n' || result.back() == '\r'))
        result.pop_back();

    // Convert to base64url: + → -, / → _, remove padding =
    for (auto& c : result) {
        if (c == '+') c = '-';
        else if (c == '/') c = '_';
    }
    while (!result.empty() && result.back() == '=') result.pop_back();

    BIO_free_all(b64);
    return result;
}

inline std::vector<uint8_t> base64urlDecode(std::string_view input) {
    // Convert base64url to standard base64
    std::string standard(input);
    for (auto& c : standard) {
        if (c == '-') c = '+';
        else if (c == '_') c = '/';
    }
    // Restore padding
    while (standard.size() % 4) standard.push_back('=');

    // Decode via OpenSSL
    BIO* b64 = BIO_new(BIO_f_base64());
    BIO* mem = BIO_new(BIO_s_mem());
    BIO_set_flags(b64, BIO_FLAGS_BASE64_NO_NL);
    BIO_push(b64, mem);

    BIO_write(mem, standard.data(), static_cast<int>(standard.size()));
    (void)BIO_flush(mem);

    // Calculate max output size
    std::vector<uint8_t> result(standard.size()); // max possible
    int len = BIO_read(b64, result.data(), static_cast<int>(result.size()));

    BIO_free_all(b64);

    if (len > 0) {
        result.resize(len);
    } else {
        result.clear();
    }
    return result;
}

// ── Random bytes (OpenSSL) ────────────────────────────────────
inline std::vector<uint8_t> randomBytes(size_t count) {
    std::vector<uint8_t> buf(count);
    if (RAND_bytes(buf.data(), static_cast<int>(count)) != 1) {
        throw std::runtime_error("RAND_bytes failed");
    }
    return buf;
}

// ── Little-endian read/write helpers ──────────────────────────
inline uint16_t readU16LE(std::span<const uint8_t> data, size_t offset) {
    return static_cast<uint16_t>(data[offset]) |
           (static_cast<uint16_t>(data[offset + 1]) << 8);
}

inline uint32_t readU32LE(std::span<const uint8_t> data, size_t offset) {
    return static_cast<uint32_t>(data[offset]) |
           (static_cast<uint32_t>(data[offset + 1]) << 8) |
           (static_cast<uint32_t>(data[offset + 2]) << 16) |
           (static_cast<uint32_t>(data[offset + 3]) << 24);
}

inline int16_t readI16LE(std::span<const uint8_t> data, size_t offset) {
    return static_cast<int16_t>(readU16LE(data, offset));
}

inline void writeU16LE(std::vector<uint8_t>& buf, uint16_t val) {
    buf.push_back(static_cast<uint8_t>(val & 0xFF));
    buf.push_back(static_cast<uint8_t>((val >> 8) & 0xFF));
}

inline void writeU32LE(std::vector<uint8_t>& buf, uint32_t val) {
    buf.push_back(static_cast<uint8_t>(val & 0xFF));
    buf.push_back(static_cast<uint8_t>((val >> 8) & 0xFF));
    buf.push_back(static_cast<uint8_t>((val >> 16) & 0xFF));
    buf.push_back(static_cast<uint8_t>((val >> 24) & 0xFF));
}

inline void writeU16LEAt(std::vector<uint8_t>& buf, size_t offset, uint16_t val) {
    if (offset + 2 > buf.size()) buf.resize(offset + 2);
    buf[offset]     = static_cast<uint8_t>(val & 0xFF);
    buf[offset + 1] = static_cast<uint8_t>((val >> 8) & 0xFF);
}

inline void writeI16LEAt(std::vector<uint8_t>& buf, size_t offset, int16_t val) {
    writeU16LEAt(buf, offset, static_cast<uint16_t>(val));
}

inline void writeU32LEAt(std::vector<uint8_t>& buf, size_t offset, uint32_t val) {
    if (offset + 4 > buf.size()) buf.resize(offset + 4);
    buf[offset]     = static_cast<uint8_t>(val & 0xFF);
    buf[offset + 1] = static_cast<uint8_t>((val >> 8) & 0xFF);
    buf[offset + 2] = static_cast<uint8_t>((val >> 16) & 0xFF);
    buf[offset + 3] = static_cast<uint8_t>((val >> 24) & 0xFF);
}

inline void writeI16LE(std::vector<uint8_t>& buf, int16_t val) {
    writeU16LE(buf, static_cast<uint16_t>(val));
}

} // namespace logsrd
