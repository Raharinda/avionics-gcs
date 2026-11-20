#!/usr/bin/env python3
"""Validate real firmware encoder/receiver output against Tauri's input schema."""
import json
import math
import sys

packets = [json.loads(line) for line in sys.stdin if line.strip()]
assert len(packets) == 5
numbers = ("temperature", "accelX", "accelY", "accelZ", "gyroX", "gyroY", "gyroZ")
for packet in packets:
    assert all(type(packet[key]) in (int, float) and math.isfinite(packet[key]) for key in numbers)
    assert type(packet["timestampMs"]) is int and 0 <= packet["timestampMs"] <= 0xFFFFFFFF
    assert packet["imuValid"] is True
    assert packet["imuReady"] is True
    assert type(packet["calibrated"]) is bool
    assert packet["pressure"] is None or (math.isfinite(packet["pressure"]) and packet["pressure"] > 0)

normal, limits, missing_bmp, invalid_pressure, stationary = packets
assert normal["timestampMs"] == 190047
assert math.isclose(normal["temperature"], 30.6)
assert math.isclose(normal["pressure"], 998.64)
assert math.isclose(normal["accelZ"], 9.18176, abs_tol=0.00051)  # m/s²
assert math.isclose(normal["gyroX"], -0.055691, abs_tol=0.000051)  # rad/s
assert normal["calibrated"] is False
assert limits["timestampMs"] == 0xFFFFFFFF
assert limits["pressure"] == 1100
assert missing_bmp["pressure"] is None and invalid_pressure["pressure"] is None
assert missing_bmp["calibrated"] is True
assert stationary["accelX"] == stationary["accelY"] == 0
assert stationary["gyroX"] == stationary["gyroY"] == stationary["gyroZ"] == 0
print("PASS: receiver JSON matches Tauri fields, SI units, timestamp, calibration flag and absent-barometer null")
