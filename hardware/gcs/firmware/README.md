# Receiver ESP32 + Ebyte E22-400T30D

Firmware receiver untuk ESP32 DevKit/WROOM klasik. Menerima stream UART E22
9600 baud dan meneruskan satu objek JSON per baris melalui USB 115200 ke Tauri.
Tidak membutuhkan sensor atau library tambahan. Konfigurasi ESP32 berada di
`include/receiver_config.h`.

Ini firmware **sensor RX**, dengan marker startup `E22 SENSOR TELEMETRY ROLE=RX`.
Pasang bersama [firmware sensor transmitter](../../avionics/firmware/README.md).

## Wiring receiver

| E22 receiver | ESP32 receiver |
| --- | --- |
| TXD | GPIO 16 / RX UART2 |
| RXD | GPIO 17 / TX UART2 |
| AUX | GPIO 23 / input |
| M0 | GND |
| M1 | GND |
| VCC | Catu modul stabil; lihat kebutuhan daya E22 |
| GND | GND bersama ESP32 receiver |

Firmware tidak mengubah konfigurasi yang tersimpan di E22. Kedua modul harus
memakai transmisi transparan, UART 9600 8N1 pada masing-masing ESP32, serta
alamat/NETID/channel/air rate/key yang cocok. Sensor hanya berada di transmitter.
Pasang antena yang sesuai dan gunakan dua node terpisah untuk pengujian radio.
Pastikan RSSI byte dan repeater OFF. Konfigurasi E22 memakai **M0=GND,
M1=3V3**, bukan keduanya HIGH. Firmware aplikasi memakai profil modul yang
sudah tersimpan; lihat [panduan E22](../../../docs/lora-e22.md) untuk profil
yang digunakan. E22-400T30D memiliki kebutuhan arus
transmisi jauh lebih tinggi daripada E32; catu 5 V stabil dengan kapasitas
setidaknya 1 A disarankan untuk node yang mengirim. UART/AUX tetap 3,3 V.

## Build dan flash

Dari root repository, pilih peran secara eksplisit:

```bash
./hardware/telemetry.sh build rx
./hardware/telemetry.sh flash rx /dev/ttyACM0
./hardware/telemetry.sh monitor rx /dev/ttyACM0
```

Sesuaikan port receiver. `telemetry.sh` memilih `avionics/firmware` untuk TX
dan `gcs/firmware` untuk RX.

Colok ESP32 receiver saja terlebih dahulu untuk mengidentifikasi portnya.
Jalankan dari folder ini:

```bash
./firmware.sh build
./firmware.sh ports
./firmware.sh flash /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Ganti port sesuai board receiver. Skrip mencari `pio` pada PATH atau
`~/.platformio/penv/bin/pio`. Tutup monitor dan koneksi Tauri sebelum upload.

## Uji link radio

1. Nyalakan transmitter yang sudah memakai firmware sensor E22, misalnya dari charger
   USB/power bank. Receiver tetap terhubung melalui USB ke laptop. Mulai pada
   jarak beberapa meter dengan antena terpasang.
2. Pada monitor receiver harus muncul startup `# E22 SENSOR TELEMETRY ROLE=RX`
   dan `# E22 receiver siap`.
3. Ketika radio menerima telemetri, muncul JSON sensor asli dan penghitung:

   ```text
   # E22 RX frame=1 bytes=... AUX=...
   # E22 RX frame=2 bytes=... AUX=...
   ```

   `...` adalah placeholder. Frame baru diharapkan sekitar setiap 2 detik,
   mengikuti transmitter dan kondisi link. `bytes` tidak menghitung newline.
4. Gerakkan transmitter; nilai accelerometer/gyro pada JSON receiver harus
   berubah dan `timestampMs` maju. Matikan transmitter: setelah sisa data dalam
   perjalanan selesai, JSON baru berhenti dan penghitung frame tidak bertambah.
   Status lokal receiver tetap dicetak setiap 10 detik.
5. Nyalakan kembali transmitter: JSON dan penghitung frame receiver berlanjut.
   Timestamp transmitter akan mulai ulang jika ESP32 transmitter ikut restart.

Penghitung `frame` menunjukkan baris yang diterima dengan pembungkus objek
`{...}`. Isi JSON, field wajib, dan validitas nilai sensor tetap diperiksa oleh
backend Rust. AUX tidak dipakai untuk memblokir pembacaan UART: E22 dapat
mengeluarkan data saat AUX LOW. AUX HIGH bukan bukti link radio terhubung.

## Dashboard

Tutup monitor receiver dengan Ctrl+C. Dari root repository:

```bash
cd software
pnpm tauri dev
```

Pilih port **receiver** sebagai sumber data, kemudian Start. Jangan pilih port
transmitter atau Dummy Data untuk pengujian jalur radio. Monitor dan Tauri
harus bergantian memakai port tersebut.

Tahap ini hanya telemetri sensor. Kalibrasi/penetapan acuan dan status/profil 3D
belum diteruskan melalui radio. Receiver mengembalikan pesan kesalahan yang
jelas untuk command kalibrasi; lakukan kalibrasi lewat USB langsung ke
transmitter. Tampilan 3D melalui receiver belum aktif pada tahap ini.

## Jika belum menerima data

Status setiap 10 detik berisi `UART_bytes`, `frames`, `discarded`, dan level
`AUX`. Nilai ini adalah diagnostik lokal, bukan pengukuran RSSI atau ACK radio.

| Gejala | Pemeriksaan |
| --- | --- |
| Startup tidak terbaca | Port receiver, monitor 115200, firmware yang di-flash, kabel USB |
| `UART_bytes=0`, `frames=0` | Transmitter hidup dan mengirim, TXD E22 ke GPIO16, M0/M1 GND, antena, catu, konfigurasi RF kedua modul |
| Byte bertambah tetapi frame tidak bertambah | Baud UART, data acak/fragmen tidak lengkap, delimiter newline transmitter |
| `discarded` bertambah | Baud/catu/link, byte rusak, baris tidak lengkap atau melebihi 512 byte |
| `menerima PING; flash firmware sensor` | Link sudah menerima pesan tes, tetapi transmitter masih memakai firmware PING |
| JSON ada tetapi Tauri tidak menerima | Monitor sudah ditutup, port receiver dipilih, Start, kesalahan JSON pada serial log Tauri |

Receiver mengumpulkan stream sampai newline melintasi beberapa paket RF.
Baris rusak/terlalu panjang dibuang seluruhnya sampai newline berikutnya,
sehingga ekor baris tersebut tidak diteruskan sebagai pengukuran baru.

Tes framing tanpa perangkat: `./test-host.sh`. Tes mencakup fragmen 32 byte,
CRLF, beberapa frame dalam satu stream, tekanan null, data biner, kapasitas
buffer, dan pemulihan setelah frame rusak. Build/tes host tidak menggantikan
pengujian radio fisik. Lihat juga [panduan sistem E22](../../../docs/lora-e22.md).
