#!/usr/bin/env bash
set -euo pipefail

cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

usage() {
    cat <<'EOF'
Pemakaian:
  ./firmware.sh build                   Compile firmware C++
  ./firmware.sh flash [PORT]            Build dan flash ke ESP32
  ./firmware.sh monitor [PORT]          Serial Monitor 115200 baud
  ./firmware.sh ports                   Lihat port yang tersedia

Contoh: ./firmware.sh flash /dev/ttyUSB0
EOF
}

action="${1:-help}"
case "$action" in
    help|-h|--help) usage; exit 0 ;;
    build|flash|monitor|ports) ;;
    *) usage >&2; exit 2 ;;
esac

if command -v pio >/dev/null 2>&1; then
    pio_bin="$(command -v pio)"
elif [[ -x "$HOME/.platformio/penv/bin/pio" ]]; then
    pio_bin="$HOME/.platformio/penv/bin/pio"
else
    echo "PlatformIO belum ditemukan. Pasang ekstensi PlatformIO IDE di VS Code." >&2
    exit 1
fi

case "$action" in
    build)
        "$pio_bin" run -e esp32dev
        echo "Firmware: $PWD/.pio/build/esp32dev/firmware.bin"
        ;;
    flash)
        args=(run -e esp32dev --target upload)
        if [[ -n "${2:-}" ]]; then args+=(--upload-port "$2"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    monitor)
        args=(device monitor --baud 115200)
        if [[ -n "${2:-}" ]]; then args+=(--port "$2"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    ports) exec "$pio_bin" device list ;;
esac
