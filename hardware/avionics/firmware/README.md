# Firmware Avionics ESP32 — MPU6050 dan BMP280

Firmware untuk ESP32 DevKit klasik / ESP-WROOM-32, menggunakan Arduino framework
dan PlatformIO. Target bawaan `esp32dev`, flash 4 MB. Untuk ESP32-C3/S3, konfigurasi
board harus disesuaikan sebelum build dan flash.

Firmware ini membaca sensor dan menampilkan hasil lewat USB Serial. Aplikasi
desktop dapat membaca format ini langsung melalui backend Rust; lihat
[panduan software](../../../software/README.md). Pengiriman ESP-NOW belum diimplementasikan.

## Isi firmware

- Membaca MPU6050: percepatan X/Y/Z (m/s²), kecepatan sudut X/Y/Z (rad/s),
  serta suhu internal chip (°C).
- Membaca BMP280: suhu (°C) dan tekanan udara (hPa).
- Hasil ditampilkan melalui Serial 115200 baud setiap 500 ms.
- Kedua sensor menggunakan satu bus `Wire`, SDA GPIO 21 dan SCL GPIO 22,
  dengan clock 100 kHz.
- Scan bus saat startup; mencoba MPU6050 di `0x68`/`0x69` dan BMP280 di
  `0x76`/`0x77`. Identitas chip diperiksa saat inisialisasi.
- Sensor yang belum ditemukan dicoba ulang setiap 5 detik. Sensor lainnya tetap
  dibaca. Saat perangkat tidak lagi merespons alamat I2C, program mencoba deteksi ulang.
- MPU6050 dibaca langsung dengan driver `Mpu6050Reader`: seluruh 14 byte harus
  diterima, konfigurasi harus sesuai, dan frame seluruhnya nol ditolak. Error
  memicu diagnostik register dan percobaan inisialisasi ulang setelah 5 detik.

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
gyroscope dalam **rad/s**. Saat diam, besar vektor percepatan
sekitar 9,81 m/s² karena gravitasi; hasil per sumbu tergantung orientasi sensor.
Offset sensor belum dikalibrasi. Suhu MPU6050 merupakan suhu internal chip.

BMP280 memakai oversampling suhu ×2, tekanan ×16, filter ×16, dan standby 250 ms.
Library menerapkan koefisien kompensasi pabrik. Nilai tekanan diubah dari Pa
menjadi hPa dengan membagi 100.

Contoh format berikut ilustrasi, bukan hasil pengujian perangkat:

```text
MPU6050 siap di 0x68
BMP280 siap di 0x76

--- Waktu: 2000 ms ---
MPU6050 | Accel [m/s^2] X=0.020 Y=-0.030 Z=9.810
        | Gyro [rad/s]  X=0.001 Y=-0.002 Z=0.001 | Suhu=29.10 C
BMP280  | Suhu=28.40 C | Tekanan=1008.25 hPa
```

## Build

```bash
cd ~/Documents/avionics-gcs/hardware/avionics/firmware
./firmware.sh build
```

PlatformIO mengunduh library Adafruit BMP280 beserta dependensinya saat build
pertama. Versinya ditetapkan di `platformio.ini`. Driver MPU6050 berada di
`include/mpu6050_reader.h` dan `src/mpu6050_reader.cpp`.

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
sebelum flash. Jika berhenti pada `Connecting...`, tahan tombol BOOT saat proses
mulai menghubungkan, lalu lepaskan setelah upload berjalan. Keluar dari monitor
dengan Ctrl+C. Jika pesan awal tidak terlihat, tekan EN/reset setelah monitor dibuka.

## Diagnostik MPU6050 bernilai nol

Versi ini mencetak `Firmware: checked-mpu6050-v1` saat startup. Setelah flash,
pastikan penanda ini muncul agar tidak memeriksa firmware lama.

Kombinasi seluruh sumbu accelerometer/gyro nol dengan suhu tetap 36,53 °C
mengarah ke data mentah nol: rumus suhu adalah `raw / 340 + 36.53`. Angka suhu
36,53 °C saja bukan bukti kegagalan; lihat keseluruhan frame dan diagnostik I2C.

Pada library Adafruit MPU6050 2.2.9 yang sebelumnya dipakai, `getEvent()` selalu
mengembalikan `true` dan `_read()` tidak meneruskan hasil keberhasilan baca bus.
Pengecekan `if (!getEvent(...))` pada firmware lama tidak cukup untuk mendeteksi
kegagalan tersebut. Driver baru memeriksa transaksi dan jumlah byte, memverifikasi
register kontrol sebelum membaca, serta memberi batas waktu reset sensor.

Register yang diharapkan setelah inisialisasi:

```text
WHO_AM_I=0x68 PWR1=0x01 PWR2=0x00 CONFIG=0x04 GYRO_CONFIG=0x08 ACCEL_CONFIG=0x10
```

`WHO_AM_I` tetap `0x68` meskipun alamat I2C dipilih `0x69`. `PWR1=0x40` menunjukkan
sleep setelah reset; `READ_FAILED` menandakan transaksi I2C gagal. Jika data nol,
read gagal, atau konfigurasi berubah, firmware menampilkan baris `MPU6050:` dan
diagnostik, melewatkan sampel MPU, lalu mencoba ulang. BMP280 tetap dibaca dan
dashboard menampilkan nilai MPU yang tidak tersedia sebagai `—`.

Untuk menerapkan perbaikan, tutup Serial Monitor dan klik Disconnect di GCS,
kemudian jalankan dari folder firmware (sesuaikan nama port):

```bash
./firmware.sh flash /dev/ttyACM0
./firmware.sh monitor /dev/ttyACM0
```

Jika error berulang setelah flash, matikan daya sebelum memeriksa ulang kabel
MPU6050: SDA ke D21, SCL ke D22, GND bersama, dan catu daya sesuai breakout dengan
logika I2C 3,3 V. Periksa sambungan longgar dan kestabilan daya. BMP280 yang masih
terbaca menunjukkan sebagian bus bekerja, tetapi belum membuktikan MPU6050 sehat.
Simpan baris diagnostik untuk membedakan masalah daya/sleep, koneksi, atau sensor.

Tes driver di komputer tanpa ESP32 (memerlukan `g++`):

```bash
./test-host.sh
```

Tes memeriksa konversi sumbu bertanda, frame nol, pembacaan tidak lengkap, NACK,
sleep/standby, perubahan rentang, identitas chip, kegagalan konfigurasi, dan reset
yang tidak selesai. Pengujian driver pada perangkat tetap memerlukan flash ulang.

## Mengembangkan kode

Edit `src/main.cpp`, lalu build dan flash ulang. Buka folder proyek ini di VS Code
dengan ekstensi PlatformIO IDE untuk memakai tombol Build, Upload, dan Monitor.
Skrip `firmware.sh` mencari `pio` di PATH atau instalasi bawaan ekstensi di
`~/.platformio/penv/bin/pio`. Build pertama di komputer lain mungkin perlu
mengunduh platform dan toolchain.

Referensi: [board ESP32 Dev Module](https://docs.platformio.org/en/stable/boards/espressif32/esp32dev.html)
dan [panduan Arduino ESP32 di PlatformIO](https://docs.platformio.org/en/stable/tutorials/espressif32/arduino_debugging_unit_testing.html).

Referensi driver MPU6050 dan rumus konversi:
[kode Adafruit MPU6050](https://github.com/adafruit/Adafruit_MPU6050).
Driver BMP280: [Adafruit BMP280](https://github.com/adafruit/Adafruit_BMP280_Library).
Rincian hardware: [datasheet BMP280](https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp280-ds001.pdf)
dan [pinout MPU6050](https://learn.adafruit.com/mpu6050-6-dof-accelerometer-and-gyro/pinouts).
