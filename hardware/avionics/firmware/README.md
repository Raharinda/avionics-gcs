# Firmware Avionics ESP32 — MPU6050 dan BMP280

Firmware untuk ESP32 DevKit klasik / ESP-WROOM-32, menggunakan Arduino framework
dan PlatformIO. Target bawaan `esp32dev`, flash 4 MB. Untuk ESP32-C3/S3, konfigurasi
board harus disesuaikan sebelum build dan flash.

Firmware `imu3d-v2` mengirim data sensor dan orientasi relatif melalui USB
Serial ke aplikasi desktop GCS. Telemetri sensor juga dikirim lewat Ebyte
E22-400T30D pada UART2, dalam mode transparan setiap dua detik saat AUX siap.
Ini firmware **sensor TX**, dengan marker startup `E22 SENSOR TELEMETRY ROLE=TX`.
Kode receiver berada di [hardware/gcs/firmware](../../gcs/firmware/README.md).
Pengiriman ESP-NOW belum diimplementasikan.
Lihat [panduan kalibrasi enam pose dan logika 3D](../../../docs/imu-orientation.md)
untuk menentukan acuan awal, pemasangan sumbu, dan membaca profil tersimpan.

## Transmitter LoRa Ebyte E22-400T30D

Konfigurasi ESP32 di `include/lora_radio.h`: UART **9600 baud 8N1**, RX **GPIO16**,
TX **GPIO17**, AUX **GPIO23**, interval **2000 ms**. Sambungkan GPIO16 ke TXD
E22, GPIO17 ke RXD E22, AUX ke GPIO23, dan GND bersama. Sensor tetap di GPIO21/22.
USB Serial tetap **115200 baud**.

Mode pin E22 (berbeda dari E32):

| Keperluan | M0 | M1 |
| --- | --- | --- |
| PING / telemetri normal | GND | GND |
| Baca/tulis konfigurasi | GND | 3V3 |
| Tidur, bukan konfigurasi | 3V3 | 3V3 |

Matikan daya sebelum mengubah jumper. VCC E22 dapat menggunakan 3,3 V yang
stabil untuk pengujian, tetapi E22-400T30D adalah modul 30 dBm dengan arus TX
sekitar 610 mA pada manual resmi. Untuk pengiriman radio, disarankan catu
5 V teregulasi dengan kapasitas setidaknya 1 A untuk modul dan margin yang cukup.
Jangan menganggap regulator 3V3 ESP32 mampu menyuplai beban ini. Sinyal UART,
AUX, M0/M1 tetap berlevel **3,3 V**, dan MPU/BMP tetap pada catu breakout yang sesuai.

Firmware telemetri tidak mengubah register E22. Kedua modul harus cocok dalam
alamat, NETID, channel, air rate dan key; UART masing-masing harus 9600 8N1,
mode TRANSPARENT, RSSI byte OFF dan repeater OFF. Pengaturan E22 dilakukan
terpisah dari firmware aplikasi; profil yang sudah berhasil dipakai tidak
perlu ditulis ulang. Lihat [panduan E22](../../../docs/lora-e22.md).

Startup berisi `# E22 SENSOR TELEMETRY ROLE=TX` dan `# LORA E22 UART siap`. Kiriman dilakukan hanya saat AUX HIGH
stabil minimal 2 ms dan buffer UART tersedia. AUX LOW menunda kiriman tanpa
memblokir sampling. Pesan pemeriksaan wiring hanya muncul setelah AUX belum
siap terus-menerus 5 detik. Log kiriman berisi
`# E22 SENSOR TX packet=1 bytes=... imu=OK baro=OK | UART lokal, bukan ACK`.
`baro=UNAVAILABLE` berarti tekanan tidak tersedia; bukti penerimaan radio ada
pada JSON dan penghitung frame di receiver.

Frame JSON sensor dibatasi aplikasi sampai 240 byte termasuk newline. E22
memiliki buffer modul 1000 byte dan sub-packet RF 32/64/128/240 byte, sehingga
receiver harus tetap menyusun stream sampai newline. IMU menargetkan 100 Hz,
BMP280 10 Hz dan USB telemetry 10 Hz. Sampel IMU tidak valid/kedaluwarsa tidak
dikirim dan muncul pesan `menunggu sampel MPU6050 valid`; barometer gagal
menghasilkan `pressure:null`. Format radio ada di `include/sensor_telemetry.h`:
`temperature` adalah suhu internal MPU6050 (°C), `pressure` dari BMP280 (hPa),
`accelX/Y/Z` dalam m/s², dan `gyroX/Y/Z` dalam rad/s.

Radio tahap ini belum meneruskan quaternion, status/profil IMU atau command
kalibrasi. Kalibrasi dan 3D tetap tersedia lewat USB langsung ke transmitter.
Manual yang berlaku: [E22-400T30D resmi](../../../docs/E22-400T30D_UserManual_EN_official.pdf).

## Isi firmware

- Membaca MPU6050: percepatan X/Y/Z (m/s²), kecepatan sudut X/Y/Z (rad/s),
  serta suhu internal chip (°C).
- Membaca BMP280: suhu (°C) dan tekanan udara (hPa).
- Target pembacaan IMU 100 Hz, pembacaan BMP280 10 Hz, dan telemetry JSON
  10 Hz melalui Serial 115200 baud.
- Kalibrasi ±X/±Y/±Z menyimpan offset/skala akselerometer dan bias gyro ke
  NVS ESP32. Quaternion relatif dikirim setelah operator menetapkan acuan.
- Kedua sensor menggunakan satu bus `Wire`, SDA GPIO 21 dan SCL GPIO 22,
  dengan clock 100 kHz.
- Scan bus saat startup; mencoba MPU6050 di `0x68`/`0x69` dan BMP280 di
  `0x76`/`0x77`. Driver MPU memeriksa identitas, konfigurasi, dan jumlah byte
  pembacaan; sampel seluruhnya nol ditolak.
- Sensor yang belum ditemukan dicoba ulang setiap 5 detik. Sensor lainnya tetap
  dibaca. Saat perangkat tidak lagi merespons alamat I2C, program mencoba deteksi ulang.

## Sambungan I2C bersama

| ESP32 DevKit | MPU6050 | BMP280 |
| --- | --- | --- |
| D21 / GPIO 21 | SDA | SDA / SDI |
| D22 / GPIO 22 | SCL | SCL / SCK |
| GND | GND | GND |
| 3V3 | VCC (modul yang mendukung 3,3 V) | VCC / VIN (modul yang mendukung 3,3 V) |

Hubungkan SDA kedua sensor secara paralel ke D21, dan SCL kedua sensor secara
paralel ke D22. Semua GND harus tersambung. Gunakan level sinyal I2C **3,3 V**;
jangan menarik SDA/SCL ke 5 V. Periksa spesifikasi breakout bila pin dayanya
berlabel VIN karena regulator tiap modul dapat berbeda.

Untuk BMP280 enam pin, CS/CSB harus HIGH (3,3 V) agar memakai I2C. SDO ke GND
memilih `0x76`, atau ke 3,3 V memilih `0x77`; jangan biarkan SDO mengambang.
Untuk MPU6050, AD0 ke GND memilih `0x68`, ke 3,3 V memilih `0x69`. Pin INT,
XDA, dan XCL tidak dipakai. BMP280 dan BME280 menggunakan driver berbeda;
proyek ini khusus BMP280 dan tidak membaca kelembapan.

Jika breakout belum menyediakan resistor pull-up, pasang pull-up sekitar
4,7 kΩ dari SDA ke 3,3 V dan dari SCL ke 3,3 V. Jika sudah ada, biasanya tidak
perlu ditambah untuk kabel pendek.

## Konfigurasi dan contoh keluaran

MPU6050 memakai rentang ±8 g, gyroscope ±500 °/s, dan filter 21 Hz. Keluaran
gyroscope dikonversi ke **rad/s** oleh driver lokal. Saat diam, besar vektor percepatan
sekitar 9,81 m/s² karena gravitasi; hasil per sumbu tergantung orientasi sensor.
Kalibrasi tersedia melalui dialog aplikasi desktop. Suhu MPU6050 merupakan suhu internal chip.

BMP280 memakai oversampling suhu ×2 dan tekanan ×16, filter ×2, serta standby
minimum (`STANDBY_MS_1` pada library). Tekanan dibaca setiap 100 ms agar altitude
lebih cepat merespons. Target telemetry tetap 10 Hz; jeda tampilan angka/grafik
gyro dan accelerometer di dashboard tetap 1 detik.
Library menerapkan koefisien kompensasi pabrik. Nilai tekanan diubah dari Pa
menjadi hPa dengan membagi 100.

Contoh format berikut ilustrasi, bukan hasil pengujian perangkat:

```text
Firmware: imu3d-v2 | MPU6050 + BMP280 | SDA=D21 SCL=D22
{"timestampMs":2000,"temperature":29.10,"pressure":1008.25,"accelX":0.020,"accelY":-0.030,"accelZ":9.810,"gyroX":0.001,"gyroY":-0.002,"gyroZ":0.001,"imuValid":true,"calibrated":false,"referenceSet":false,"orientation":null}
```

## Build

Untuk membangun atau mem-flash pasangan sensor TX/RX dari root repository:

```bash
./hardware/telemetry.sh build
./hardware/telemetry.sh flash tx /dev/ttyUSB0
./hardware/telemetry.sh flash rx /dev/ttyACM0
```

Sesuaikan port dengan board masing-masing. Profil E22 yang sudah berhasil
dipakai tetap tersimpan; M0 dan M1 kedua modul tetap GND untuk telemetri.

Untuk mengerjakan transmitter saja dari folder ini:

```bash
cd ~/Documents/avionics-gcs/hardware/avionics/firmware
./firmware.sh build
```

PlatformIO mengunduh library Adafruit BMP280 beserta dependensinya saat build
pertama. MPU6050 memakai driver register lokal dengan pemeriksaan I2C.
Versi library utama ditetapkan di `platformio.ini`.

Hasil build berada di `.pio/build/esp32dev/`, termasuk `firmware.bin`,
`firmware.elf`, `bootloader.bin`, dan `partitions.bin`. `firmware.bin` adalah
aplikasi, bukan gabungan seluruh isi flash. Gunakan perintah flash di bawah agar
PlatformIO mengirim aplikasi beserta komponen boot pada alamat yang sesuai.

## Flash melalui USB

Hubungkan ESP32 dengan kabel USB data, lalu jalankan:

```bash
./firmware.sh ports
./firmware.sh flash
./firmware.sh monitor
```

Untuk memilih port secara eksplisit:

```bash
./firmware.sh flash /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Flash mengganti firmware yang sedang terpasang di board. Tutup Serial Monitor
dan hentikan koneksi GCS sebelum flash. Jika berhenti pada `Connecting...`, tahan tombol BOOT saat proses
mulai menghubungkan, lalu lepaskan setelah upload berjalan. Keluar dari monitor
dengan Ctrl+C. Jika pesan awal tidak terlihat, tekan EN/reset setelah monitor dibuka.

## Mengembangkan kode

Edit `src/main.cpp`, lalu build dan flash ulang. Buka folder proyek ini di VS Code
dengan ekstensi PlatformIO IDE untuk memakai tombol Build, Upload, dan Monitor.
Skrip `firmware.sh` mencari `pio` di PATH atau instalasi bawaan ekstensi di
`~/.platformio/penv/bin/pio`. Build pertama di komputer lain mungkin perlu
mengunduh platform dan toolchain.

Referensi: [board ESP32 Dev Module](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html)
dan [panduan Arduino ESP32 di PlatformIO](https://docs.platformio.org/en/stable/tutorials/espressif32/arduino_debugging_unit_testing.html).

Tes driver, orientasi, dan alur JSON sensor TX → fragmen UART → parser RX:
jalankan `./test-host.sh` (memerlukan `g++` dan Python 3). Tes memastikan field
dan satuan untuk Tauri, tekanan `null`, serta penolakan nilai non-finite dan
frame terpotong. Tes tidak menggantikan pemeriksaan sensor/radio pada perangkat.

Driver sensor: `src/mpu6050_reader.cpp` dan
[Adafruit BMP280](https://github.com/adafruit/Adafruit_BMP280_Library).
Rincian hardware: [datasheet BMP280](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf)
dan [pinout MPU6050](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts).
