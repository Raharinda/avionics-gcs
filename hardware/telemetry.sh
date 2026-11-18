#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

usage() {
    cat <<'EOF'
Telemetri sensor E22 (MPU6050 + BMP280).
  ./hardware/telemetry.sh build [tx|rx]       Build keduanya atau satu peran
  ./hardware/telemetry.sh flash tx PORT       Flash firmware sensor transmitter
  ./hardware/telemetry.sh flash rx PORT       Flash receiver JSON untuk Tauri
  ./hardware/telemetry.sh monitor tx|rx PORT  Monitor USB 115200
  ./hardware/telemetry.sh ports              Daftar port
  ./hardware/telemetry.sh test               Tes sensor, UART, dan framing
M0 dan M1 kedua modul harus GND. Register E22 yang sudah disetel dipertahankan.
EOF
}

action="${1:-help}"
role="${2:-}"
case "$role" in
    tx) project=avionics/firmware ;;
    rx) project=gcs/firmware ;;
    *) project="" ;;
esac

case "$action" in
    help|-h|--help) usage ;;
    build)
        if [[ -z "$role" && $# -le 1 ]]; then
            avionics/firmware/firmware.sh build
            exec gcs/firmware/firmware.sh build
        fi
        if [[ -z "$project" || $# -gt 2 ]]; then usage >&2; exit 2; fi
        exec "$project/firmware.sh" build
        ;;
    flash|monitor)
        if [[ -z "$project" || $# -ne 3 || -z "${3:-}" ]]; then usage >&2; exit 2; fi
        exec "$project/firmware.sh" "$action" "$3"
        ;;
    ports) exec avionics/firmware/firmware.sh ports ;;
    test)
        avionics/firmware/test-host.sh
        exec gcs/firmware/test-host.sh
        ;;
    *) usage >&2; exit 2 ;;
esac
