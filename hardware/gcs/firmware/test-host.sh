#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test_binary="$(mktemp /tmp/gcs-e32-tests.XXXXXX)"
trap 'rm -f -- "$test_binary"' EXIT
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -I include \
    test/host/test_telemetry_line_buffer.cpp -o "$test_binary"
"$test_binary"
for aux_pin in -1 27; do
    g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
        -DE32_AUX_PIN="$aux_pin" -I ../../avionics/firmware/test/host/radio-stubs -I include -I ../../shared \
        test/host/test_gpio19_link.cpp -o "$test_binary"
    "$test_binary"
    g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
        -DE32_AUX_PIN="$aux_pin" -I ../../avionics/firmware/test/host/radio-stubs -I include \
        test/host/test_e32_radio.cpp -o "$test_binary"
    "$test_binary"
done
