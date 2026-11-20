#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
test_binary="$(mktemp /tmp/avionics-mpu6050-tests.XXXXXX)"
trap 'rm -f -- "$test_binary"' EXIT
g++ -std=c++11 -Wall -Wextra -Werror -pedantic \
    -I test/host/stubs -I include \
    src/mpu6050_reader.cpp test/host/test_mpu6050_reader.cpp -o "$test_binary"
"$test_binary"
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
    -I test/host/stubs -I include \
    src/mpu6050_reader.cpp test/host/test_imu_recovery.cpp -o "$test_binary"
"$test_binary"
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -I include \
    test/host/test_imu_orientation.cpp -o "$test_binary"
"$test_binary"
g++ -std=c++17 -Wall -Wextra -Werror -pedantic -I include \
    test/host/test_imu_profile_storage.cpp -o "$test_binary"
"$test_binary"
for aux_pin in -1 27; do
    g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
        -DE32_AUX_PIN="$aux_pin" -DBOARD_POP_TEST_INPUT_PIN=-1 \
        -I test/host/radio-stubs -I include -I ../../shared \
        test/host/test_e32_radio.cpp -o "$test_binary"
    "$test_binary"
    g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
        -DE32_AUX_PIN="$aux_pin" -DBOARD_POP_TEST_INPUT_PIN=-1 \
        -I test/host/radio-stubs -I ../../shared \
        test/host/test_e32_setup.cpp -o "$test_binary"
    "$test_binary"
done
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
    -I test/host/pulse-stubs -I test/host/radio-stubs -I include \
    test/host/test_gpio19_output.cpp -o "$test_binary"
"$test_binary"
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
    -I include -I ../../gcs/firmware/include \
    test/host/test_sensor_telemetry.cpp -o "$test_binary"
"$test_binary" | python3 test/host/check_sensor_packets.py
g++ -std=c++17 -Wall -Wextra -Werror -pedantic \
    -I include -I ../../gcs/firmware/include \
    test/host/test_telemetry_average.cpp -o "$test_binary"
"$test_binary"
