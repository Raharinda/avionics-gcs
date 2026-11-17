# Transmitter dan receiver ESP32 + Ebyte E32-433T20D

Firmware aktif berada di `hardware/avionics/firmware`. Modul yang ditargetkan
adalah **E32-433T20D**, mengikuti
[manual lokal](E32-433T20D_UserManual_EN_v1.1_fr.pdf). Contoh RYLR998 lama tidak
berlaku untuk modul ini.

## Wiring transmitter

Matikan daya saat mengubah sambungan, lalu gunakan:

| E32 | ESP32 klasik |
| --- | --- |
| M0 | GND |
| M1 | GND |
| RXD | GPIO 17 (TX UART2) |
| TXD | GPIO 16 (RX UART2) |
| AUX | GPIO 23 (input) |
| VCC | Catu 3,3 V stabil untuk pengujian pengguna |
| GND | GND bersama ESP32 dan sensor |

MPU6050 dan BMP280 tetap memakai SDA GPIO 21, SCL GPIO 22, dan catu breakout
yang sesuai. M0/M1 tidak boleh mengambang. UART dan AUX tetap berlevel logika
3,3 V. Catu uji 3,3 V tidak mengubah konfigurasi firmware; kestabilan dan
kemampuan arus regulator tetap perlu diperiksa pada perangkat.

## Konfigurasi dan perilaku

- USB ESP32 ↔ laptop: **115200 baud**.
- UART2 ESP32 ↔ E32: **9600 baud, 8N1**.
- M0=M1=LOW memilih mode normal; modul harus sudah memakai transmisi transparan.
- Alamat/channel/air rate/daya/FEC modul **tidak ditulis ulang oleh firmware**.
  Default manual adalah alamat `0x0000`, channel `0x17` (433 MHz), air rate
  2,4 kbps. Pastikan konfigurasi kedua modul cocok sebelum menguji link.
- Tidak ada perintah AT dan tidak ada header `AT+SEND`/`+RCV`.
- IMU tetap dibaca dengan target 100 Hz, BMP280 10 Hz, USB telemetry 10 Hz.
- Pengiriman radio mencoba sampel terbaru setiap **2 detik**, hanya ketika
  AUX HIGH stabil minimal 2 ms dan buffer UART cukup. Pemeriksaan ini tidak
  menunggu secara blocking di loop IMU.
- Selama AUX LOW, pengiriman ditunda. Jika kembali HIGH, pengiriman dapat
  dilanjutkan tanpa reset ESP32. AUX yang lepas/tersambung salah bukan deteksi
  modul yang dapat diandalkan; firmware tidak dapat memverifikasi mode/frekuensi.
- Satu frame JSON sensor diakhiri newline. Batas aplikasi 240 byte termasuk
  newline; E32 memiliki buffer 512 byte dan otomatis memecah paket RF 58 byte.
- Sampel MPU tidak valid/kedaluwarsa tidak dikirim. Barometer yang gagal
  menghasilkan `pressure:null`, sehingga data IMU tetap dapat diterima backend.
- Quaternion, status/profil kalibrasi, dan command dari receiver belum dikirim
  lewat radio. Fitur USB langsung ke transmitter tetap tersedia.

## Build dan flash

Dari root repository:

```bash
cd hardware/avionics/firmware
./firmware.sh build
./firmware.sh ports
```

Hubungkan ESP32 transmitter. Tutup koneksi Tauri dan Serial Monitor yang sedang
memakai port tersebut, lalu ganti contoh port di bawah sesuai hasil deteksi:

```bash
./firmware.sh flash /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Jika upload tertahan di `Connecting...`, tahan BOOT dan lepaskan ketika mulai
menulis flash. Jika output awal terlewat, tekan EN/RESET setelah monitor dibuka.

Startup menampilkan:

```text
# LORA E32 UART siap | baud=9600 RX=16 TX=17 AUX=23 | M0=M1=GND | interval=2000ms
# LORA E32 memakai konfigurasi modul tersimpan: harus transparent 9600 8N1; default 433MHz
```

Jika sampel IMU valid dan AUX siap, sekitar setiap 2 detik muncul:

```text
# LORA E32 TX UART bytes=... | bukan ACK receiver
```

Log tersebut membuktikan frame dimasukkan ke UART ESP32, bukan penerimaan oleh
receiver. Konfirmasi radio hanya bisa dilakukan dari data yang benar-benar tiba
pada receiver. AUX LOW sesaat selama transmisi adalah kondisi normal. Pesan
`AUX belum siap selama >=5000ms` hanya muncul setelah AUX tidak siap
terus-menerus selama 5 detik, lalu diulang setiap 5 detik jika belum pulih.
Begitu AUX siap, waktu tunggu direset. USB telemetry dan sensor tetap berjalan.

## Receiver dan uji radio

Receiver harus memakai E32 dengan konfigurasi radio yang cocok, UART 9600,
M0/M1 LOW, dan meneruskan JSON yang diterima ke USB 115200. Data diterima
langsung, bukan dalam wrapper `+RCV`. Kumpulkan stream sampai newline dengan
buffer terbatas; jangan menganggap satu pembacaan UART atau satu paket RF
sebagai satu JSON utuh. Jeda antarfragmen bukan akhir frame.

Firmware receiver E32 tersedia di `hardware/gcs/firmware`. Firmware receiver
lama untuk RYLR998 tidak kompatibel. Wiring E32 receiver memakai GPIO 16/17
untuk UART dan GPIO 23 untuk AUX, dengan M0/M1 terhubung ke GND.

Colok receiver ke laptop, identifikasi portnya, lalu:

```bash
cd hardware/gcs/firmware
./firmware.sh build
./firmware.sh ports
./firmware.sh flash /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Ganti port sesuai board receiver. Nyalakan transmitter dari sumber daya
terpisah dan periksa JSON sensor serta `# E32 RX frame=...` di monitor
receiver. Gerakkan transmitter untuk mengubah pembacaan. Matikan transmitter:
setelah sisa data tiba, frame baru harus berhenti; hidupkan lagi untuk memeriksa
pemulihan link. Status receiver tetap dicetak setiap 10 detik.

Setelah JSON terbukti tiba melalui radio, tutup monitor receiver dan buka
aplikasi Tauri. Pilih port receiver dan Start. Jangan memakai Dummy Data atau
USB transmitter untuk membuktikan jalur radio. Kalibrasi dan 3D melalui radio
belum tersedia; receiver menjelaskan keterbatasan tersebut ketika menerima
command kalibrasi dari USB.

Lihat [README receiver](../hardware/gcs/firmware/README.md) untuk wiring,
diagnostik byte/frame/AUX, dan petunjuk pengujian lengkap.

## Verifikasi tanpa perangkat

```bash
./test-host.sh
```

Selain driver/kalibrasi yang sudah ada, tes E32 memeriksa pemetaan UART/AUX,
penantian HIGH stabil dan pemulihan setelah LOW, rollover `millis`, pengiriman
JSON+newline tanpa wrapper, penolakan frame berlebih/tidak lengkap, dan penundaan
saat UART penuh. Tes ini memakai stub, sehingga tidak menggantikan pengujian
catu, timing dan transmisi radio pada perangkat fisik.
