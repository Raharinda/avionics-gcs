#include <cassert>
#include <iostream>
#include <string>
#include <vector>
#include "telemetry_line_buffer.h"

using Buffer=receiver::TelemetryLineBuffer;
using Result=Buffer::Result;

int main() {
    const std::string json="{\"timestampMs\":190047,\"temperature\":30.60,\"pressure\":998.64,\"accelX\":-0.474,\"accelY\":-0.022,\"accelZ\":9.182,\"gyroX\":-0.0557,\"gyroY\":0.0288,\"gyroZ\":-0.0168,\"imuValid\":true,\"calibrated\":false}";
    Buffer buffer;
    // Simulate E22 32-byte RF chunks with arbitrary pauses between calls. No
    // chunk boundary can publish a partial JSON line before the final newline.
    for (std::size_t offset=0;offset<json.size();offset+=32)
        for (char c:json.substr(offset,32)) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Line);
    assert(buffer.size()==json.size() && std::string(buffer.line())==json);
    std::cout<<"PASS: fragmented E22 JSON is forwarded exactly once, only after newline\n";

    std::vector<std::string> lines;
    const std::string stream="\r\n"+json+"\r\n{\"pressure\":null}\n";
    for (char c:stream) {
        const auto result=buffer.push(c);
        if (result==Result::Line) lines.emplace_back(buffer.line());
        else assert(result==Result::None);
    }
    assert(lines.size()==2 && lines[0]==json && lines[1]=="{\"pressure\":null}");
    std::cout<<"PASS: multiple frames, CRLF and empty lines preserve JSON and null pressure\n";

    for (char c:std::string("{\"pressure\":123")) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Invalid);
    assert(buffer.push('{')==Result::None);
    assert(buffer.push('\0')==Result::None);
    assert(buffer.push('}')==Result::None);
    assert(buffer.push('\n')==Result::Invalid);
    for (char c:std::string("{\"x\":1}")) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Line);
    assert(std::string(buffer.line())=="{\"x\":1}");
    std::cout<<"PASS: incomplete and binary-corrupted lines are rejected; next frame recovers\n";

    for (char c:std::string("PING 123")) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Invalid);
    assert(std::string(buffer.line())=="PING 123");
    std::cout<<"PASS: old PING firmware is identifiable and cannot be forwarded as sensor telemetry\n";

    const std::string exact="{"+std::string(Buffer::kCapacity-2,'x')+"}";
    for (char c:exact) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Line && buffer.size()==Buffer::kCapacity);
    for (char c:exact+'x'+"{}") assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Oversized); // No tail forwarded as a frame.
    for (char c:json) assert(buffer.push(c)==Result::None);
    assert(buffer.push('\n')==Result::Line && std::string(buffer.line())==json);
    std::cout<<"PASS: capacity boundary and oversized-line discard/recovery\n";
}
