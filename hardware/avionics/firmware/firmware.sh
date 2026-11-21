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
  ./firmware.sh build-direct            Build tes UART kabel tanpa AUX
  ./firmware.sh flash-direct [PORT]     Flash tes UART kabel tanpa AUX
  ./firmware.sh build-setup             Build konfigurator E32
  ./firmware.sh setup [PORT]            Flash konfigurator E32 lalu buka monitor

Contoh: ./firmware.sh flash /dev/ttyUSB0
EOF
}

if [[ $# -gt 2 || "${2:-}" == tx || "${2:-}" == rx || "${2:-}" == config || "${2:-}" == setup ]]; then
    echo "Skrip ini menerima flash [PORT], tanpa peran tx/rx/config/setup." >&2
    echo "Untuk memilih tx/rx, gunakan ./hardware/telemetry.sh dari root repository." >&2
    exit 2
fi

action="${1:-help}"
case "$action" in
    help|-h|--help) usage; exit 0 ;;
    build|build-direct|build-setup|flash|flash-direct|setup|monitor|ports) ;;
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
    build|build-direct|build-setup)
        firmware_env=esp32dev
        if [[ "$action" == build-direct ]]; then firmware_env=uart_direct; fi
        if [[ "$action" == build-setup ]]; then firmware_env=e32_setup; fi
        "$pio_bin" run -e "$firmware_env"
        echo "Firmware: $PWD/.pio/build/$firmware_env/firmware.bin"
        ;;
    flash|flash-direct|setup)
        firmware_env=esp32dev
        if [[ "$action" == flash-direct ]]; then firmware_env=uart_direct; fi
        if [[ "$action" == setup ]]; then
            firmware_env=e32_setup
            echo "Setup E32: M0=GPIO25 M1=GPIO26 AUX=GPIO27; lepaskan M0/M1 dari GND langsung."
        fi
        args=(run -e "$firmware_env" --target upload)
        if [[ -n "${2:-}" ]]; then args+=(--upload-port "$2"); fi
        if [[ "$action" == setup ]]; then
            "$pio_bin" "${args[@]}"
            monitor_args=(device monitor --baud 115200 --eol LF --echo --filter send_on_enter)
            if [[ -n "${2:-}" ]]; then monitor_args+=(--port "$2"); fi
            exec "$pio_bin" "${monitor_args[@]}"
        fi
        exec "$pio_bin" "${args[@]}"
        ;;
    monitor)
        args=(device monitor --baud 115200 --eol LF --echo --filter send_on_enter)
        if [[ -n "${2:-}" ]]; then args+=(--port "$2"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    ports) exec "$pio_bin" device list ;;
esac
