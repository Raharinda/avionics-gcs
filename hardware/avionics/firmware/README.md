# Firmware Avionics ESP32 — MPU6050 dan BMP280

Firmware untuk ESP32 DevKit klasik / ESP-WROOM-32, menggunakan Arduino framework
dan PlatformIO. Target bawaan `esp32dev`, flash 4 MB. Untuk ESP32-C3/S3, konfigurasi
board harus disesuaikan sebelum build dan flash.

Firmware `imu3d-v2` mengirim data sensor dan orientasi relatif melalui USB
Serial ke aplikasi desktop GCS. Pengiriman ESP-NOW belum diimplementasikan.
Lihat [panduan kalibrasi enam pose dan logika 3D](../../../docs/imu-orientation.md)
untuk menentukan acuan awal, pemasangan sumbu, dan membaca profil tersimpan.

## Isi firmware

- Membaca MPU6050: percepatan X/Y/Z (m/s²), kecepatan sudut X/Y/Z (rad/s),
  serta suhu internal chip (°C).
- Membaca BMP280: suhu (°C) dan tekanan udara (hPa).
- Target pembacaan IMU 100 Hz, pembacaan BMP280 2 Hz, dan telemetry JSON
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

BMP280 memakai oversampling suhu ×2, tekanan ×16, filter ×16, dan standby 250 ms.
Library menerapkan koefisien kompensasi pabrik. Nilai tekanan diubah dari Pa
menjadi hPa dengan membagi 100.

Contoh format berikut ilustrasi, bukan hasil pengujian perangkat:

```text
Firmware: imu3d-v2 | MPU6050 + BMP280 | SDA=D21 SCL=D22
{"timestampMs":2000,"temperature":29.10,"pressure":1008.25,"accelX":0.020,"accelY":-0.030,"accelZ":9.810,"gyroX":0.001,"gyroY":-0.002,"gyroZ":0.001,"imuValid":true,"calibrated":false,"referenceSet":false,"orientation":null}
```

## Build

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

Tes driver dan perhitungan orientasi tanpa perangkat: jalankan `./test-host.sh`
(memerlukan compiler `g++`). Tes tidak menggantikan pemeriksaan gerakan dan
penyimpanan pada perangkat asli.

Driver sensor: `src/mpu6050_reader.cpp` dan
[Adafruit BMP280](https://github.com/adafruit/Adafruit_BMP280_Library).
Rincian hardware: [datasheet BMP280](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf)
dan [pinout MPU6050](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts).
