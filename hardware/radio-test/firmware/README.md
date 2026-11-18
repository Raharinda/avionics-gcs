# Uji dan konfigurasi Ebyte E22-400T30D

Proyek ini memakai **E22-400T30D**, bukan RYLR998 atau E32. Panduan utama:
[panduan E22](../../../docs/lora-e22.md). Manual resmi tersedia di
[docs](../../../docs/E22-400T30D_UserManual_EN_official.pdf).

## Wiring

| E22 | ESP32 DevKit/WROOM klasik |
| --- | --- |
| RXD | TX2 / GPIO17 |
| TXD | RX2 / GPIO16 |
| AUX | GPIO23 |
| GND | GND ESP32 pada node yang sama |
| VCC | Catu stabil sesuai kebutuhan E22 |

**Mode normal/PING:** M0=GND, M1=GND.
**Mode config/setup:** M0=GND, M1=3V3.
**Keduanya 3V3 adalah deep sleep**, bukan mode konfigurasi E22.
Matikan daya sebelum memindahkan jumper. Lepaskan seluruh jumper loopback
sebelum menghubungkan kembali modul. USB 115200, UART E22 9600 8N1.

E22-400T30D adalah modul 30 dBm dengan arus TX sekitar 610 mA pada manual resmi.
Catu 5 V stabil berkapasitas setidaknya 1 A disarankan untuk transmisi; GPIO dan
UART tetap 3,3 V. Catu 3,3 V hanya memadai jika regulator mampu menyuplai modul
secara stabil. Sensor tetap memakai catu breakout yang sesuai.

## Empat peran firmware

- `config`: hanya membaca register dengan **C1 00 09**, tanpa menulis modul.
- `setup`: menulis profil tes permanen satu kali per boot, lalu membaca ulang.
- `tx`: mengirim **PING** setiap 2 detik, tanpa bergantung pada sensor.
- `rx`: menampilkan **RX RADIO: PING ...** yang diterima dari UART2.

Peran tx/rx tidak membaca MPU/BMP atau menghasilkan IMU_STATE. USB input tidak
diteruskan ke radio; RX RADIO bukan echo ketikan. Build default hanya tx/rx.

## 1. Baca konfigurasi (M0 GND, M1 3V3)

Dari root repository:

```bash
cd hardware/radio-test/firmware
./firmware.sh build config
./firmware.sh ports
./firmware.sh flash config /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Sesuaikan port. Cari output **CONFIG HEX: C1 00 09 ...**, total 12 byte.
Pembaca menampilkan alamat, NETID, UART/parity, channel/frekuensi, air-rate bits,
paket, daya, mode, RSSI byte, repeater dan LBT. CRYPT_H/L hanya bisa ditulis;
hasil baca nol tidak membuktikan key tersimpan nol. Mode pin tidak dikendalikan
ESP32 dan firmware tidak bisa memverifikasi posisi jumper secara langsung.

## 2. Profil tes yang sama untuk kedua modul (opsional)

Dengan posisi mode konfigurasi, lakukan pada masing-masing modul:

```bash
./firmware.sh build setup
./firmware.sh flash setup /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Build setup menulis **permanen**: alamat/NETID 0, UART 9600 8N1, air 2,4 kbps,
paket 240 byte, daya 21 dBm, CHAN=23 (433,125 MHz), transparan, RSSI byte/
repeater/LBT OFF, dan permintaan key 0000. Ini mengubah register tersimpan E22.
Tunggu **SETUP VERIFIED** setelah ACK dan pembacaan ulang cocok. Key yang
write-only tidak dapat diverifikasi dari hasil baca. Perintah:

```text
C0 00 09 00 00 00 62 03 17 03 00 00
```

Mode config/setup tidak mengirim PING. Selesai membaca/menulis: matikan daya,
kembalikan M0/M1 ke GND, lalu flash peran tx/rx.

## 3. Uji PING (M0/M1 keduanya GND)

Colok hanya board transmitter untuk memastikan portnya, lalu:

```bash
./firmware.sh flash tx /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Pastikan ROLE=TX dan TX UART: PING ... muncul. Tutup monitor. Transmitter boleh
menyala di laptop teman atau catu USB sendiri. Colok board receiver ke laptop
penerima dan sesuaikan portnya:

```bash
./firmware.sh flash rx /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Pastikan ROLE=RX, kemudian cari:

```text
RX RADIO: PING 12
RX RADIO: PING 13
```

Nomor awal boleh berbeda. Ini bukti penerimaan satu arah, sementara TX UART
hanya menunjukkan pengiriman lokal. Matikan TX: setelah sisa data tiba, PING
berhenti. Hidupkan lagi: PING muncul kembali. Antena harus terpasang dan mulai
pada jarak beberapa meter. Kedua modul harus memiliki register radio yang cocok;
flash ESP32 tx/rx sendiri tidak mengubah register modul.

Jika UART_RX_bytes=0, belum ada byte masuk dari LoRa ke ESP32 RX. Penghitung
mulai ulang ketika ESP32 restart. Beberapa byte tanpa RX_lines tidak membuktikan
penerimaan PING. Periksa terlebih dahulu CONFIG HEX dari kedua modul pada mode
konfigurasi E22 yang benar, termasuk wiring dan catu. AUX HIGH bukan bukti link.

## Kembali ke telemetri dan tes host

Setelah PING berhasil, flash firmware sensor dari hardware/avionics/firmware
ke transmitter dan hardware/gcs/firmware ke receiver. Keduanya memakai
`./firmware.sh flash PORT` tanpa tx/rx/config/setup. Mode normal tetap M0=M1=GND.
Firmware test tidak menghapus profil kalibrasi sensor ESP32.

Tes decoder: `./test-host.sh`. Tes UART/AUX berada di firmware avionics dan
framing JSON di firmware GCS. Semua tes host tidak menggantikan pengujian fisik.
