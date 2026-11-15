#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test_binary="$(mktemp /tmp/avionics-mpu6050-tests.XXXXXX)"
trap 'rm -f -- "$test_binary"' EXIT
g++ -std=c++11 -Wall -Wextra -Werror -pedantic \
    -I test/host/stubs -I include \
    src/mpu6050_reader.cpp test/host/test_mpu6050_reader.cpp -o "$test_binary"
"$test_binary"
