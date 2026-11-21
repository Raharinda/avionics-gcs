# Receiver ESP32 + Ebyte E32-433T30D

Firmware receiver untuk ESP32 DevKit/WROOM klasik. Menerima stream UART E32
9600 baud dan meneruskan satu objek JSON per baris melalui USB 115200 ke Tauri.
Tidak membutuhkan sensor atau library tambahan. Konfigurasi ESP32 berada di
`include/receiver_config.h`.

Ini firmware **sensor RX**, dengan marker startup `E32-433T30D SENSOR TELEMETRY ROLE=RX`.
Pasangkan dengan [firmware transmitter E32-433T30D](../../avionics/firmware/README.md)
dan modul fisik E32-433T30D pada kedua sisi, dengan profil radio yang cocok.

Transmitter sekarang mengirim rata-rata suhu, tekanan, accel XYZ, dan gyro XYZ
dari satu jendela pembacaan, dengan interval minimal dua detik saat radio siap.
Format JSON tetap sama sehingga receiver meneruskan baris tanpa perhitungan
ulang. `timestampMs` menunjukkan akhir jendela; jumlah sampel dan durasinya
tersedia di log USB transmitter. Paket sensor tidak memakai ACK/pengiriman ulang;
command pulsa D19 memakai ACK dan retry. Lihat [LoRa dua arah](../../../docs/lora-bidirectional.md).

## Wiring receiver

| E32 receiver | ESP32 receiver |
| --- | --- |
| TXD | GPIO 16 / RX UART2 |
| RXD | GPIO 17 / TX UART2 |
| AUX | GPIO27 / input, aktif secara default |
| M0 | GPIO25 |
| M1 | GPIO26 |
| VCC | Catu 5 V stabil (rentang modul 3,3–5,2 V) |
| GND | GND bersama ESP32 receiver |

Firmware tidak menulis ulang parameter tersimpan di E32. Gunakan transmisi
transparan, UART **9600 8N1**, dan cocokkan alamat, channel, air rate serta FEC
pada kedua modul E32. Profil acuan: alamat `0x0000`, channel `0x17` (433 MHz),
air rate 2,4 kbps. E32 tidak memakai register NETID/key/RSSI tambahan E22.
Sensor hanya berada di transmitter. Pasang antena pada kedua node.

Receiver memilih NORMAL saat boot. Perintah USB lokal mengikuti mode E32:

| M0,M1 | Perintah | Fungsi |
| --- | --- | --- |
| 0,0 | `LORA_MODE:NORMAL` | Telemetri transparan |
| 1,0 | `LORA_MODE:WAKEUP` | Wake-up; RX seperti NORMAL |
| 0,1 | `LORA_MODE:POWER_SAVING` atau `WOR` | RX hemat daya; transmitter harus WAKEUP |
| 1,1 | `LORA_MODE:SLEEP` atau `CONFIG` | Tidur/konfigurasi; tanpa telemetri |

`LORA_PINS:<M0>,<M1>` menerima keempat kombinasi di atas. Khusus E32,
**CONFIG = 1,1**, sedangkan **0,1 = POWER_SAVING**. Ketik `LORA_HELP` untuk
bantuan dan `LORA_STATUS` untuk melihat mode. Tunggu `phase=IDLE` setelah
guard pergantian sekitar 3 detik. AUX harus HIGH stabil minimal 2 ms.
Selama transisi dan SLEEP/CONFIG, buffer JSON parsial dikosongkan.
Perintah CONFIG hanya memilih mode; terminal ini tidak meneruskan perintah
register biner ke modul. Semua perintah bersifat lokal, bukan dikirim ke TX.

Pin mengikuti [gpioesp32.jpeg](../../../docs/gpioesp32.jpeg); gambar GPIO ini
menjadi acuan jika berbeda dengan skematik keseluruhan. M0/M1 dikendalikan
GPIO25/26 dan AUX dibaca pada GPIO27. Jika M0/M1 langsung ke GND untuk
NORMAL tetap, lepaskan sambungannya dari GPIO25/26 dan jangan gunakan
perintah pergantian mode. Untuk AUX yang tidak disambungkan,
aktifkan `build_flags = -DE32_AUX_PIN=-1` di `platformio.ini`.
Tombol CALIBRATION GPIO13 belum difungsikan. POP_TEST_IN GPIO14 hanya input;
POP_TEST_OUT GPIO19 tetap LOW. Lihat [daftar pin](../../../docs/hardware-pinout.md).

Gunakan catu 5 V stabil dan logika UART/AUX **3,3 V**, dengan GND bersama.
E32-433T30D adalah varian 1 W; manual mencantumkan arus TX sekitar 610 mA.
Sediakan margin arus jika modul juga dipakai mengirim. Detail mode dan profil
merujuk [manual Ebyte E32-433T30D](https://fixaj.com/wp-content/uploads/2021/08/E32-433T30D_Usermanual_EN_v1.91.pdf).

## Build dan flash

Dari root repository, pilih peran secara eksplisit:

```bash
./hardware/telemetry.sh build rx
./hardware/telemetry.sh flash rx /dev/ttyACM0
./hardware/telemetry.sh monitor rx /dev/ttyACM0
```

Sesuaikan port receiver. `telemetry.sh` memilih `avionics/firmware` untuk TX
dan `gcs/firmware` untuk RX. Sertakan `hardware/shared` jika menyalin firmware
ke komputer lain.

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

1. Nyalakan transmitter yang sudah memakai firmware sensor dengan radio E32 dan profil yang cocok, misalnya dari charger
   USB/power bank. Receiver tetap terhubung melalui USB ke laptop. Mulai pada
   jarak beberapa meter dengan antena terpasang.
2. Pada monitor receiver harus muncul startup `# E32-433T30D SENSOR TELEMETRY ROLE=RX`
   dan `# E32-433T30D receiver siap`.
3. Ketika radio menerima telemetri, muncul JSON sensor asli dan penghitung:

   ```text
   # E32 RX frame=1 bytes=... mode=NORMAL AUX=enabled
   # E32 RX frame=2 bytes=... mode=NORMAL AUX=enabled
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
backend Rust. Ketika AUX opsional diaktifkan, AUX LOW tidak memblokir UART
masuk: E32 dapat mengeluarkan data saat LOW. Guard tanpa AUX dan AUX HIGH
sama-sama tidak membuktikan link radio terhubung.

## Dashboard

Tutup monitor receiver dengan Ctrl+C. Dari root repository:

```bash
cd software
pnpm tauri dev
```

Pilih port **receiver** sebagai sumber data, kemudian Start. Jangan pilih port
transmitter atau Dummy Data untuk pengujian jalur radio. Monitor dan Tauri
harus bergantian memakai port tersebut.

Link juga meneruskan command pulsa D19 dari software beserta ACK avionics.
Kalibrasi/penetapan acuan dan status/profil 3D
belum diteruskan melalui radio. Receiver mengembalikan pesan kesalahan yang
jelas untuk command kalibrasi; lakukan kalibrasi lewat USB langsung ke
transmitter. Tampilan 3D melalui receiver belum aktif pada tahap ini.

## Jika belum menerima data

Status setiap 10 detik berisi `UART_bytes`, `frames`, `discarded`, `mode`,
`phase`, dan status penggunaan AUX. Nilai ini adalah diagnostik lokal,
bukan pengukuran RSSI atau ACK radio.

| Gejala | Pemeriksaan |
| --- | --- |
| Startup tidak terbaca | Port receiver, monitor 115200, firmware yang di-flash, kabel USB |
| `UART_bytes=0`, `frames=0` | Transmitter hidup dan mengirim, TXD E32 ke GPIO16, mode NORMAL/IDLE pada kedua node, antena, catu, konfigurasi RF kedua modul |
| Byte bertambah tetapi frame tidak bertambah | Baud UART, data acak/fragmen tidak lengkap, delimiter newline transmitter |
| `discarded` bertambah | Baud/catu/link, byte rusak, baris tidak lengkap atau melebihi 512 byte |
| `menerima PING; flash firmware sensor` | Link sudah menerima pesan tes, tetapi transmitter masih memakai firmware PING |
| JSON ada tetapi Tauri tidak menerima | Monitor sudah ditutup, port receiver dipilih, Start, kesalahan JSON pada serial log Tauri |

Receiver mengumpulkan stream sampai newline melintasi beberapa paket RF.
Baris rusak/terlalu panjang dibuang seluruhnya sampai newline berikutnya,
sehingga ekor baris tersebut tidak diteruskan sebagai pengukuran baru.

Tes framing tanpa perangkat: `./test-host.sh`. Tes mencakup mode E32 (termasuk CONFIG=1,1), AUX, fragmen 58 byte,
CRLF, beberapa frame dalam satu stream, tekanan null, data biner, kapasitas
buffer, pemulihan setelah frame rusak, dan reset buffer saat pergantian mode. Build/tes host tidak menggantikan
pengujian radio fisik. Lihat juga [panduan receiver E32](../../../docs/lora-e32.md).

## Menyamakan konfigurasi tersimpan E32

Gunakan `./hardware/telemetry.sh setup rx /dev/ttyUSB0` dari root
repository. Perintah memasang konfigurator sementara pada ESP32, menyimpan
profil E32 dan membuka monitor. **M0 harus ke GPIO25, M1 ke GPIO26, AUX ke
GPIO27; lepaskan M0/M1 dari GND langsung sebelum setup.** Tunggu
`E32_SETUP SUCCESS`, lalu pasang kembali firmware telemetri memakai `flash`.
Lakukan setup pada kedua modul; lihat [panduan setup E32](../../../docs/lora-e32.md#setup-parameter-e32-lewat-esp32)
untuk wiring, profil dan contoh hasil verifikasi.
