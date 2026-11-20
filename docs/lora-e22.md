> **ARSIP E22.** Firmware aktif TX dan RX kini menggunakan E32-433T30D.
> Ikuti [panduan E32](lora-e32.md). Mode dan perintah register E22 di bawah
> tidak berlaku untuk E32.

# ESP32 + Ebyte E22-400T30D: telemetri MPU6050 dan BMP280

Panduan ini disimpan sebagai referensi konfigurasi E22-400T30D lama.
Manual referensi E22:
[manual resmi E22](E22-400T30D_UserManual_EN_official.pdf), diunduh dari
[Ebyte](https://www.cdebyte.com/pdf-down.aspx?id=1489).

## Wiring dan mode pin

| E22-400T30D | ESP32 DevKit/WROOM klasik                 |
| ----------- | ----------------------------------------- |
| RXD         | TX2 / GPIO17                              |
| TXD         | RX2 / GPIO16                              |
| M0          | GPIO25, output                            |
| M1          | GPIO26, output                            |
| AUX         | GPIO27, input aktif pada build bawaan      |
| GND         | GND ESP32 pada node yang sama             |
| VCC         | Catu modul yang stabil, lihat bagian daya |

| Penggunaan                        | M0  | M1  |
| --------------------------------- | --- | --- |
| Telemetri normal                  | LOW | LOW |
| WOR                               | HIGH | LOW |
| Membaca / menulis konfigurasi E22 | LOW | HIGH |
| Deep sleep                        | HIGH | HIGH |

**Matikan daya sebelum mengubah wiring.** M0 dan M1 terhubung langsung ke GPIO,
dengan resistor bias pada masing-masing jalur; jangan mengikatnya langsung ke
GND/3V3. Firmware memulai kedua output LOW (NORMAL). R1/R2 100 kΩ ke GND pada
skema adalah **pull-down**, bukan pull-up; pull-down 10 kΩ memberikan bias LOW
yang lebih kuat. Pull-up, bila digunakan, harus menuju 3V3; kedua mode HIGH
berarti tidur sampai program mengubah pinnya.

Acuan pin adalah [gambar GPIO ESP32 terbaru](gpioesp32.jpeg), yang
menggantikan penomoran pada [skematik keseluruhan](skematikAvionicGCSdanPop.jpeg).
M0=GPIO25, M1=GPIO26, AUX=GPIO27; GPIO12 tidak digunakan. Semua pin dan
status tombol tercantum pada [panduan pin hardware](hardware-pinout.md).

AUX GPIO27 dibaca secara default. Untuk board tanpa AUX, aktifkan
`build_flags = -DE22_AUX_PIN=-1` di `platformio.ini` firmware terkait.
Jangan memakai pin GPIO13/14 sebagai jalur LoRa karena keduanya adalah input
tombol pada gambar terbaru. Tombol kalibrasi belum diberi aksi; output
POP_TEST GPIO19 tetap LOW.

USB Serial ESP32 ke laptop tetap **115200 baud**. UART konfigurasi E22 selalu
**9600 baud 8N1**. UART data normal bergantung register tersimpan; profil
dan firmware proyek ini memakai **9600 baud 8N1**.

## Daya: koreksi dari E32

E22-400T30D adalah modul **30 dBm / 1 W RF**, berbeda dari E32-433T20D.
Manual resmi mencantumkan VCC 3,3–5,5 V, 5 V tipikal, dan arus TX sekitar
**610 mA**. Untuk uji transmisi, gunakan catu **5 V teregulasi dengan kapasitas
setidaknya 1 A** untuk modul, dengan margin bagi beban lain. Angka 1 A adalah
rekomendasi kapasitas catu, bukan arus konstan modul.

Catu 3,3 V tetap dapat dicoba jika regulator memadai dan tegangan pada modul
stabil; jangan menganggap regulator 3V3 board ESP32 cukup. Menurunkan daya RF
tidak menurunkan arus secara proporsional menurut manual. GPIO/UART/AUX/M0/M1
tetap berlevel **3,3 V**, dan sensor MPU6050/BMP280 tetap diberi catu sesuai
breakout. Semua GND pada satu node harus disatukan. Pasang antena sebelum TX.

## Konfigurasi modul yang digunakan

Firmware aplikasi tidak membaca atau menulis register E22. Modul memakai
pengaturan yang sudah tersimpan; bila komunikasi sudah berhasil, tidak perlu
mengonfigurasi ulang hanya karena firmware ESP32 diganti.

Profil kedua modul yang digunakan pada pengujian:

| Pengaturan | Nilai |
| --- | --- |
| Alamat / NETID | 0x0000 / 0 |
| UART | 9600 baud, 8N1 |
| Air rate | 2,4 kbps |
| Channel | 0x17 / 433,125 MHz |
| Sub-packet | 240 byte |
| Daya RF | 21 dBm |
| Mode transmisi | Transparan |
| Byte RSSI / repeater / LBT | OFF |
| Key yang diminta saat konfigurasi | 0x0000 |

Jika perlu mengubah pengaturan modul, gunakan alat konfigurasi UART E22 sesuai
manual resmi dengan mode CONFIG (M0 LOW, M1 HIGH) dan UART 9600 8N1. Perintah baca E22 adalah
`C1 00 09`: 9 register mulai alamat 00H. Balasan valid berisi 12 byte diawali
`C1 00 09`, bukan balasan enam byte C0/C2 milik E32. Contoh register publik
untuk profil di atas:

```text
C1 00 09 00 00 00 62 03 17 03 00 00
```

**CRYPT_H/L hanya bisa ditulis; hasil baca nol tidak membuktikan key tersimpan
nol.** Pastikan key dan parameter RF kedua modul cocok. Pilih kembali NORMAL
sebelum memakai telemetri sensor. Alat konfigurasi register tidak disertakan
sebagai proyek firmware dalam repository ini.

## Memilih M0/M1 dari terminal USB

Driver bersama ada di `hardware/shared/e22_radio.h`; `hardware/shared` adalah
kode pendukung untuk dua proyek firmware TX/RX. Sertakan folder ini jika
memindahkan firmware ke komputer lain. Kedua ESP32 menerima perintah lokal
berikut melalui monitor USB 115200, diakhiri newline/Enter. Tutup koneksi
dashboard ke port yang sama, lalu dari root proyek buka salah satu node:

```bash
./hardware/telemetry.sh monitor tx /dev/ttyUSB0
# Atau, untuk node receiver:
./hardware/telemetry.sh monitor rx /dev/ttyACM0
```

Sesuaikan port. Monitor helper memakai echo lokal, newline LF, dan
`send_on_enter`, sehingga perintah dikirim saat Enter ditekan. Ketik:

```text
LORA_HELP
LORA_STATUS
```

| Perintah pin (urutan M0,M1) | Perintah mode setara | Hasil |
| --- | --- | --- |
| `LORA_PINS:0,0` | `LORA_MODE:NORMAL` | Telemetri normal |
| `LORA_PINS:1,0` | `LORA_MODE:WOR` | Wake-on-radio |
| `LORA_PINS:0,1` | `LORA_MODE:CONFIG` | Mode konfigurasi |
| `LORA_PINS:1,1` | `LORA_MODE:SLEEP` | Tidur |

M0/M1 tetap berada di GPIO25/26; perintah memilih level output 0/1, bukan
mengganti nomor GPIO. Nilai selain 0/1 atau format yang tidak lengkap ditolak.
Tidak ada penambahan kontrol mode pada dashboard.

Pergantian mode menjeda TX radio, menunggu guard 2 detik sebelum mengubah pin,
kemudian guard 1 detik untuk mode baru. Proses ini tidak memblokir sampling
sensor. Periksa `LORA_STATUS` setelah sekitar 3 detik; `target` adalah mode
yang diminta, sedangkan `mode` diperbarui saat `phase=IDLE`. `M0_SET/M1_SET`
menunjukkan level yang diperintahkan driver ke pin, termasuk saat SETTLING;
ini bukan pembacaan register internal E22. `AUX_READY=1` berarti AUX HIGH
stabil, `0` berarti belum siap, dan `NA` berarti AUX dinonaktifkan.
Permintaan mode
lain saat transisi ditolak. Perintah hanya mengendalikan node yang tersambung
USB dan tidak dikirim ke node lain. Restart mengembalikan mode NORMAL.

Dari kode, setelah fase startup selesai, gunakan:

```cpp
radio::requestMode(radio::Mode::Configuration, millis());
// Loop yang ada terus memanggil service/readyToSend/canReceive tanpa delay.
```

Untuk mengirim telemetri lagi, minta `radio::Mode::Normal` setelah fase kembali
IDLE. Pemilihan CONFIG mengubah pin
mode saja; tidak menulis register. Telemetri radio otomatis hanya berjalan
dalam NORMAL. WOR memerlukan konfigurasi arah/preamble/wake period yang sesuai
pada register E22, sehingga TX sensor otomatis dijeda pada WOR, CONFIG, SLEEP,
dan selama transisi. RX menerima telemetri dalam NORMAL/WOR yang sudah siap;
byte pada mode CONFIG/SLEEP/transisi dibuang dan buffer JSON parsial direset.

Tanpa AUX, guard startup 1 detik dan jarak TX minimal 2 detik diasumsikan untuk
profil radio **2,4 kbps**, dengan frame maksimum 240 byte. Guard waktu tidak
membuktikan modul siap atau paket diterima. Jika kecepatan radio diturunkan,
perpanjang guard atau aktifkan AUX agar status sibuk dapat diperiksa. Pada
build bawaan dengan AUX GPIO27, HIGH stabil minimal 2 ms juga diperlukan untuk TX dan
pergantian mode; penerimaan UART tetap dibaca saat AUX LOW.

## Transmitter, receiver, dan dashboard

Kode transmitter berada di `hardware/avionics/firmware`, sedangkan kode
receiver berada di `hardware/gcs/firmware`. Gunakan firmware berikut.
Profil E22 tetap tersimpan: **tidak perlu setup ulang**. Firmware mengendalikan
M0/M1 melalui GPIO25/26 dan memilih NORMAL saat boot pada kedua node.

MPU6050 dan BMP280 hanya dipasang pada transmitter, berbagi SDA GPIO21 dan
SCL GPIO22. UART radio kedua board tetap RX GPIO16 dan TX GPIO17.
Detail sensor tersedia di [README transmitter](../hardware/avionics/firmware/README.md).
Pin bertuliskan TX/RX tanpa nomor pada ESP32 klasik biasanya UART0 GPIO1/3;
gunakan GPIO16/17 untuk radio agar USB monitor dan dashboard tetap bekerja.

Tutup monitor dan koneksi Tauri sebelum flash. Dari root repository:

```bash
./hardware/telemetry.sh build
./hardware/telemetry.sh flash tx /dev/ttyUSB0
./hardware/telemetry.sh flash rx /dev/ttyACM0
./hardware/telemetry.sh monitor rx /dev/ttyACM0
```

Sesuaikan port dengan board masing-masing; gunakan `./hardware/telemetry.sh ports`
untuk melihat daftar port. Skrip ini memilih proyek avionics untuk TX dan GCS
untuk RX. Flash ESP32 tidak menghapus profil E22 maupun profil kalibrasi sensor
yang tersimpan oleh firmware.

Marker startup masing-masing firmware:

```text
# E22 SENSOR TELEMETRY ROLE=TX | MPU6050 + BMP280 | JSON sensor melalui radio
# E22 SENSOR TELEMETRY ROLE=RX | JSON sensor radio -> USB -> Tauri
```

Transmitter membaca IMU dengan target 100 Hz dan barometer 10 Hz, lalu mengirim
JSON sensor terbaru setiap **2 detik** dalam NORMAL setelah guard. Receiver mengumpulkan
stream sampai newline dan meneruskannya ke USB 115200; framing tidak bergantung
ukuran paket RF. Contoh keluaran receiver berikut ilustrasi:

```text
{"timestampMs":190047,"temperature":30.60,"pressure":998.64,"accelX":-0.474,"accelY":-0.022,"accelZ":9.182,"gyroX":-0.0557,"gyroY":0.0288,"gyroZ":-0.0168,"imuValid":true,"calibrated":false}
# E22 RX frame=1 bytes=189 mode=NORMAL AUX=enabled
```

`bytes` mengikuti panjang JSON yang diterima, tidak termasuk newline.
`temperature` adalah suhu internal MPU6050 (°C), `pressure` dari BMP280 (hPa),
percepatan dalam m/s², dan gyro dalam rad/s. Data bukan pembacaan RSSI atau
konfirmasi penerimaan dari log UART transmitter.

Sampel MPU tidak valid atau lebih tua dari 200 ms **tidak dikirim**; transmitter
mencetak `menunggu sampel MPU6050 valid`. Bila hanya BMP280 yang gagal, IMU
tetap dikirim dengan `pressure:null` dan log TX `baro=UNAVAILABLE`. Jika receiver
mencetak `menerima PING; flash firmware sensor`, transmitter masih memakai
firmware tes dan perlu di-flash dengan perintah `telemetry.sh flash tx` di atas.

Gerakkan sensor dan periksa angka di JSON receiver berubah. Matikan transmitter:
setelah sisa data selesai diterima, JSON baru berhenti. Nyalakan kembali untuk
memastikan penerimaan berlanjut. Ini memeriksa jalur sensor → radio → receiver.

Setelah JSON terbukti tiba, tutup monitor dengan Ctrl+C, jalankan `pnpm tauri dev`
dari `software`, pilih **port receiver**, lalu Start. Jangan jalankan monitor
bersamaan dengan Tauri pada port yang sama. Kalibrasi, profil/status IMU,
quaternion dan perintah jarak jauh belum diteruskan lewat radio pada tahap ini;
kalibrasi/3D tetap melalui USB langsung ke transmitter.

## Verifikasi software

Jalankan `./hardware/telemetry.sh test` dari root repository (`g++` dan Python 3).
Tes mencakup driver/kalibrasi, pin/guard keempat mode dengan AUX terlepas maupun
AUX GPIO27, penanganan UART penuh/partial write, rollover timer, dan
reset buffer saat pergantian mode. Alur sensor → fragmen UART → parser RX juga
memeriksa field/satuan JSON untuk Tauri, nilai non-finite, tekanan `null`, dan
penolakan PING/frame rusak.
Build dan tes host tidak menggantikan tes sensor maupun radio fisik.
