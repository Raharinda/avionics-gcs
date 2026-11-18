#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

usage() {
    cat <<'EOF'
Pemakaian:
  ./firmware.sh build [tx|rx]       Build kedua peran, atau satu peran
  ./firmware.sh build config       Build pembaca konfigurasi E22
  ./firmware.sh build setup        Build penulis profil tes E22
  ./firmware.sh flash tx [PORT]    Flash board pengirim PING
  ./firmware.sh flash rx [PORT]    Flash board penerima PING
  ./firmware.sh flash config [PORT] Baca E22 (M0=GND, M1=3V3)
  ./firmware.sh flash setup [PORT]  Tulis profil tes E22 permanen, lalu verifikasi
  ./firmware.sh monitor [PORT]     Monitor USB 115200 baud
  ./firmware.sh ports              Lihat port yang tersedia
EOF
}

action="${1:-help}"
role="${2:-}"
case "$action" in
    help|-h|--help) usage; exit 0 ;;
    build)
        if [[ -n "$role" && "$role" != tx && "$role" != rx && "$role" != config && "$role" != setup ]]; then usage >&2; exit 2; fi
        ;;
    flash)
        if [[ "$role" != tx && "$role" != rx && "$role" != config && "$role" != setup ]]; then usage >&2; exit 2; fi
        ;;
    monitor|ports) ;;
    *) usage >&2; exit 2 ;;
esac

if command -v pio >/dev/null 2>&1; then
    pio_bin="$(command -v pio)"
elif [[ -x "$HOME/.platformio/penv/bin/pio" ]]; then
    pio_bin="$HOME/.platformio/penv/bin/pio"
else
    echo "PlatformIO belum ditemukan." >&2
    exit 1
fi

case "$action" in
    build)
        args=(run)
        if [[ -n "$role" ]]; then args+=(-e "$role"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    flash)
        args=(run -e "$role" --target upload)
        if [[ -n "${3:-}" ]]; then args+=(--upload-port "$3"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    monitor)
        args=(device monitor --baud 115200)
        if [[ -n "${2:-}" ]]; then args+=(--port "$2"); fi
        exec "$pio_bin" "${args[@]}"
        ;;
    ports) exec "$pio_bin" device list ;;
esac
