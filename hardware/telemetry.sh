#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

usage() {
    cat <<'EOF'
Telemetri sensor E32-433T30D (MPU6050 + BMP280).
  ./hardware/telemetry.sh build [tx|rx]       Build keduanya atau satu peran
  ./hardware/telemetry.sh build-direct [tx|rx] Build tes kabel tanpa AUX
  ./hardware/telemetry.sh flash-direct tx|rx PORT  Flash tes kabel tanpa AUX
  ./hardware/telemetry.sh build-setup [tx|rx] Build konfigurator E32
  ./hardware/telemetry.sh setup tx|rx PORT    Flash ESP32, simpan profil E32, buka monitor
  ./hardware/telemetry.sh flash tx PORT       Flash firmware sensor transmitter
  ./hardware/telemetry.sh flash rx PORT       Flash receiver JSON untuk Tauri
  ./hardware/telemetry.sh monitor tx|rx PORT  Monitor USB 115200
  ./hardware/telemetry.sh ports              Daftar port
  ./hardware/telemetry.sh test               Tes sensor, UART, dan framing
M0=GPIO25, M1=GPIO26; AUX TX/RX=GPIO27/D27 (aktif). Boot NORMAL.
Parameter E32 yang sudah disetel dipertahankan. Lihat docs/lora-e32.md untuk mode USB.
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
    build|build-direct|build-setup)
        if [[ -z "$role" && $# -le 1 ]]; then
            avionics/firmware/firmware.sh "$action"
            exec gcs/firmware/firmware.sh "$action"
        fi
        if [[ -z "$project" || $# -gt 2 ]]; then usage >&2; exit 2; fi
        exec "$project/firmware.sh" "$action"
        ;;
    flash|flash-direct|setup|monitor)
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
