#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test_binary="$(mktemp /tmp/e22-config-tests.XXXXXX)"
trap 'rm -f -- "$test_binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -I include \
    test/host/test_e22_config.cpp -o "$test_binary"
"$test_binary"
