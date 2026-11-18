# ESP32 + Ebyte E22-400T30D: telemetri MPU6050 dan BMP280

Modul fisik pengguna adalah **E22-400T30D**. Panduan RYLR998 dan E32 sebelumnya
adalah arsip untuk perangkat berbeda. Manual yang berlaku:
[manual resmi E22](E22-400T30D_UserManual_EN_official.pdf), diunduh dari
[Ebyte](https://www.cdebyte.com/pdf-down.aspx?id=1489).

## Wiring dan mode pin

| E22-400T30D | ESP32 DevKit/WROOM klasik                 |
| ----------- | ----------------------------------------- |
| RXD         | TX2 / GPIO17                              |
| TXD         | RX2 / GPIO16                              |
| AUX         | GPIO23, sebagai input                     |
| GND         | GND ESP32 pada node yang sama             |
| VCC         | Catu modul yang stabil, lihat bagian daya |

| Penggunaan                        | M0  | M1  |
| --------------------------------- | --- | --- |
| Telemetri normal                  | GND | GND |
| Membaca / menulis konfigurasi E22 | GND | 3V3 |
| Deep sleep                        | 3V3 | 3V3 |

**Matikan daya sebelum memindahkan jumper.** Lepaskan jumper loopback GPIO16–17
dan GPIO23–3V3 sebelum memasang kembali LoRa. AUX modul harus kembali ke GPIO23.
Jangan menyambungkan M0 ke 3V3 untuk konfigurasi E22: kedua pin HIGH memilih tidur.

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
manual resmi dengan M0=GND, M1=3V3 dan UART 9600 8N1. Perintah baca E22 adalah
`C1 00 09`: 9 register mulai alamat 00H. Balasan valid berisi 12 byte diawali
`C1 00 09`, bukan balasan enam byte C0/C2 milik E32. Contoh register publik
untuk profil di atas:

```text
C1 00 09 00 00 00 62 03 17 03 00 00
```

**CRYPT_H/L hanya bisa ditulis; hasil baca nol tidak membuktikan key tersimpan
nol.** Pastikan key dan parameter RF kedua modul cocok. Kembalikan M0 dan M1
ke GND sebelum memakai firmware sensor. Alat konfigurasi tidak disertakan
sebagai proyek firmware dalam repository ini.

## Transmitter, receiver, dan dashboard

Kode transmitter berada di `hardware/avionics/firmware`, sedangkan kode
receiver berada di `hardware/gcs/firmware`. Gunakan firmware berikut.
Profil E22 tetap tersimpan: **tidak perlu setup ulang**, dan **M0=M1=GND**
pada kedua modul untuk telemetri.

MPU6050 dan BMP280 hanya dipasang pada transmitter, berbagi SDA GPIO21 dan
SCL GPIO22. UART radio kedua board tetap RX GPIO16, TX GPIO17, AUX GPIO23.
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
JSON sensor terbaru setiap **2 detik** jika AUX siap. Receiver mengumpulkan
stream sampai newline dan meneruskannya ke USB 115200; framing tidak bergantung
ukuran paket RF. Contoh keluaran receiver berikut ilustrasi:

```text
{"timestampMs":190047,"temperature":30.60,"pressure":998.64,"accelX":-0.474,"accelY":-0.022,"accelZ":9.182,"gyroX":-0.0557,"gyroY":0.0288,"gyroZ":-0.0168,"imuValid":true,"calibrated":false}
# E22 RX frame=1 bytes=189 AUX=1
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
Tes mencakup driver/kalibrasi, timing AUX, serialisasi pembacaan sensor sampai
parser receiver melalui fragmen UART, validitas field/satuan JSON untuk Tauri,
penolakan sampel non-finite, tekanan `null`, dan penolakan PING/frame rusak.
Build dan tes host tidak menggantikan tes sensor maupun radio fisik.
