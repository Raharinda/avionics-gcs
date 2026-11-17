#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test_binary="$(mktemp /tmp/gcs-e32-tests.XXXXXX)"
trap 'rm -f -- "$test_binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -I include \
    test/host/test_telemetry_line_buffer.cpp -o "$test_binary"
"$test_binary"
