# Dokumentasi Kerentanan & Risiko Keandalan Firmware Hardware

Dokumen ini mencatat temuan kerentanan, celah keandalan (*reliability*), dan risiko keselamatan pada firmware **ESP32 Avionics (TX)** (`hardware/avionics/firmware`) dan **ESP32 GCS Receiver (RX)** (`hardware/gcs/firmware`). Dokumen ini bersifat audit dan rekomendasi teknis; kode firmware hardware tidak diubah pada tahap ini.

---

## Ringkasan Temuan

| ID | Komponen | Tingkat | Judul Singkat |
| --- | --- | --- | --- |
| HW-01 | Avionics TX | **Kritis** | Satu glitch I2C MPU6050 menghapus acuan 3D permanen & blackout IMU 5 detik |
| HW-02 | Avionics TX | **Tinggi** | Data IMU stale tetap dikirim via USB saat gagal & serialisasi USB tanpa guard `isfinite` |
| HW-03 | GCS RX | **Tinggi** | Framing `TelemetryLineBuffer` rentan terhadap hilangnya `\n` (gabungan 2 JSON) & 1 byte noise |
| HW-04 | Avionics TX & GCS RX | **Tinggi** | Paket radio tanpa checksum/CRC, tanpa sequence number, dan tanpa enkripsi/autentikasi terverifikasi |
| HW-05 | Avionics TX & GCS RX | **Menengah** | Belum ada protokol perintah uplink & *hardware interlock* ejection pada firmware |
| HW-06 | Avionics TX | **Menengah** | Threshold `norm(gyro) < 0.20 rad/s` lebih ketat dari offset bawaan datasheet MPU6050 & pesan error `saveProfile()` menyesatkan |
| HW-07 | Avionics TX & GCS RX | **Rendah** | Instansiasi ganda `HardwareSerial(2)` yang bertumpuk dengan objek global `Serial2` |
| HW-08 | Avionics TX | **Rendah** | Pembacaan ganda suhu BMP280 yang tidak dipakai & blocking `delay(100)` saat re-init di `loop()` |

---

## Detail Temuan & Rekomendasi Mitigasi

### [HW-01] Satu Glitch I2C MPU6050 Menghapus Acuan 3D Permanen & Blackout IMU 5 Detik
- **Tingkat**: **Kritis (Flight Reliability)**
- **Lokasi**:
  - `hardware/avionics/firmware/src/mpu6050_reader.cpp` (baris 45–57, 59–80, 82–85)
  - `hardware/avionics/firmware/src/main.cpp` (baris 155–169, 255–261, 362–364)
- **Analisis Teknis**:
  1. `Mpu6050Reader::read()` memanggil `verify_configuration()` pada **setiap sampel 100 Hz**, menambah 3 transaksi baca I2C (`0x75`, `0x6B..0x6C`, `0x1A..0x1C`) di atas pembacaan 14 byte data. Beban bus I2C `100 kHz` meningkat signifikan dan memperbesar peluang NACK/clock-stretch saat getaran tinggi.
  2. Ketika **satu kali saja** `mpu.read()` gagal, `sampleImu()` langsung mengeksekusi:
     ```cpp
     imuValid = false; mpuReady = false; referenceSet = false; filter.reset();
     lastRetryMs = millis();
     ```
  3. Pemulihan baru dicoba **5 detik kemudian** (`now - lastRetryMs >= 5000`), dan `mpu.begin()` memblokir `loop()` selama minimal **200–400 ms** (`delay(100)` × 2 + polling reset).
- **Skenario Kegagalan**:
  - Pada fase peluncuran (getaran mekanik/EMI tinggi), satu glitch I2C tunggal menyebabkan kehilangan telemetri IMU selama 5 detik penuh, jeda blocking pada pembacaan BMP280/LoRa, serta hilangnya `referenceSet` secara permanen karena operator tidak mungkin menetapkan acuan diam saat roket sedang terbang.
- **Rekomendasi Mitigasi**:
  - Terapkan penghitung kegagalan beruntun (*consecutive error threshold*, mis. 3–5 sampel gagal berturut-turut) sebelum menyatakan `mpuReady = false`.
  - Lakukan `verify_configuration()` secara periodik (mis. 1–2 Hz) atau hanya saat `ZeroFrame` / read error, bukan pada setiap sampel 100 Hz.
  - Gunakan *state machine* non-blocking untuk re-inisialisasi sensor (tanpa `delay(100)`) dengan interval retry yang lebih pendek (mis. 500 ms–1000 ms).
  - Pertimbangkan strategi pemulihan attitude berbasis `lastReference` / gravitasi jika hanya terjadi gangguan singkat.

---

### [HW-02] Data IMU Stale Tetap Dikirim di JSON USB & Tanpa Guard `isfinite`
- **Tingkat**: **Tinggi**
- **Lokasi**:
  - `hardware/avionics/firmware/src/main.cpp` (baris 258, 324–339)
- **Analisis Teknis**:
  1. Saat `mpu.read()` gagal, `main.cpp` menyetel `imuValid = false`, tetapi variabel global `accel`, `gyro`, dan `temperature` tidak dibersihkan atau diganti `null`. Fungsi `telemetry()` tetap mencetak nilai lama (stale) setiap 100 ms ke USB Serial.
  2. Berbeda dari jalur LoRa (`sensor_telemetry::encodeLine` yang memvalidasi `std::isfinite` pada seluruh nilai), fungsi `telemetry()` di `main.cpp` hanya mengecek `std::isfinite(pressure)`. Jika `temperature`, `accel`, `gyro`, atau quaternion `relative` bernilai `NaN`/`Inf`, `Serial.printf` akan mencetak literal `nan`/`inf` yang melanggar spesifikasi JSON.
- **Skenario Kegagalan**:
  - Klien/monitor serial selain backend Tauri (yang tidak memfilter `imuValid: false`) dapat mengira data sensor masih aktif padahal macet di nilai terakhir. Jika nilai `NaN` muncul, seluruh baris JSON menjadi tidak valid.
- **Rekomendasi Mitigasi**:
  - Validasi `std::isfinite` untuk semua field float sebelum serialisasi USB (atau gunakan encoder bersama seperti `sensor_telemetry.h`).
  - Kirim `null` untuk nilai sensor saat `imuValid == false` atau hentikan penerbitan nilai stale pada frame invalid.

---

### [HW-03] Kerentanan Framing `TelemetryLineBuffer` pada Receiver LoRa
- **Tingkat**: **Tinggi**
- **Lokasi**:
  - `hardware/gcs/firmware/include/telemetry_line_buffer.h` (baris 12–37)
  - `hardware/gcs/firmware/src/main.cpp` (baris 14–36)
- **Analisis Teknis**:
  1. **Hilangnya delimiter `\n` menggabungkan 2 paket valid**: Panjang 1 frame JSON sensor adalah ~190–220 byte sedangkan kapasitas buffer adalah `512` byte. Jika byte `\n` di akhir paket 1 hilang akibat interferensi RF, paket 1 dan paket 2 akan terakumulasi menjadi `{...}{...}` (~400 byte ≤ 512 byte). Karena `data_[0] == '{'` dan `data_[length_-1] == '}'`, `TelemetryLineBuffer` mengembalikan `Result::Line` dan meneruskan JSON rusak ke Tauri, sehingga **kedua paket sekaligus hilang**.
  2. **Satu byte noise non-ASCII membuang paket valid berikutnya**: Jika satu byte rusak (`< 0x20` atau `> 0x7E`, mis. noise UART atau RSSI byte aktif tanpa sengaja) diterima sebelum karakter `{`, `discard_` disetel menjadi `Result::Invalid`. Semua byte sesudahnya—termasuk JSON valid lengkap yang langsung menyusul—akan dibuang sampai ditemukan `\n`.
- **Skenario Kegagalan**:
  - Pada jarak jauh / SNR rendah di lapangan, tingkat kehilangan paket (*packet loss*) menjadi dua kali lipat dari jumlah korupsi byte aktual.
- **Rekomendasi Mitigasi**:
  - Saat menerima karakter `{` baru di tengah buffer yang sudah berisi `{`, reset buffer untuk memulai sinkronisasi frame baru agar paket kedua tetap terselamatkan.
  - Pertimbangkan framing biner ringan atau delimiter awal-akhir eksplisit (mis. STX/ETX atau prefix + CRC16) sebelum payload JSON.

---

### [HW-04] Paket Radio Tanpa Checksum/CRC, Sequence Number, dan Verifikasi Keamanan RF
- **Tingkat**: **Tinggi (Integritas & Keamanan Link)**
- **Lokasi**:
  - `hardware/avionics/firmware/include/sensor_telemetry.h` (baris 21–46)
  - `hardware/avionics/firmware/include/lora_radio.h` (baris 7–19, 80–89)
- **Analisis Teknis**:
  1. **Tanpa checksum/CRC aplikasi**: Mode transparan UART E22 tidak menjamin integritas *end-to-end* antara MCU TX → UART → E22 → RF → E22 → UART → MCU RX. Korupsi bit pada karakter angka JSON (mis. `998.64` berubah menjadi `908.64`) tetap menjadi JSON valid dan dapat menghasilkan lonjakan altitude palsu ratusan meter.
  2. **Tanpa nomor urut (`sequence`)**: Paket hanya membawa `timestampMs` (milidetik `millis()`), sehingga deteksi *packet loss*, duplikasi, atau paket *out-of-order* harus menebak interval pengiriman.
  3. **Keamanan RF tidak diverifikasi firmware**: Firmware tidak pernah memverifikasi konfigurasi register E22 (`NETID`, `CRYPT_H/L`). Pada dokumentasi pengujian, `CRYPT` default adalah `0x0000` (tanpa enkripsi aktif), sehingga siapa pun di channel `433.125 MHz` dapat menyadap atau menyuntikkan paket JSON palsu (*spoofing*) ke receiver GCS.
- **Rekomendasi Mitigasi**:
  - Tambahkan field `seq` (monotonic counter) dan checksum (mis. CRC-16/CRC-32) pada frame radio, serta verifikasi checksum di firmware GCS RX atau backend Rust sebelum diteruskan sebagai telemetri valid.
  - Aktifkan key enkripsi non-nol (`CRYPT_H/L`) pada kedua modul E22 sebelum uji lapangan.

---

### [HW-05] Ketiadaan Protokol Uplink & *Hardware Interlock* Ejection pada Firmware
- **Tingkat**: **Menengah (Keselamatan / Safety-Critical Readiness)**
- **Lokasi**:
  - `hardware/gcs/firmware/src/main.cpp` (baris 38–56)
  - `hardware/avionics/firmware/src/main.cpp` (baris 180–235)
- **Analisis Teknis**:
  - Saat ini jalur radio masih sepenuhnya **satu arah (downlink sensor saja)** dan firmware avionics belum memiliki handler, state machine safety, maupun *hardware interlock* untuk perintah ejection charge.
  - Catatan keselamatan di `README.md` mensyaratkan otorisasi operator, konfirmasi eksplisit, interlock keselamatan, pembedaan status kirim vs konfirmasi eksekusi (ACK), serta perlakuan fail-safe saat koneksi terputus.
- **Rekomendasi Mitigasi (Sebelum Implementasi Kontrol Ejection)**:
  - Jangan pernah memakai mode transparan tanpa autentikasi untuk perintah piroteknik/ejection.
  - Wajib terapkan: MAC/HMAC + nonce/sequence anti-replay, dua tahap terpisah (`ARM` dengan timeout otomatis + `FIRE` dengan token sesi), *hardware arming switch* fisik pada roket, interlock sensor (mis. verifikasi apogee/kecepatan/ketinggian), dan paket ACK terverifikasi dari ESP32 Avionics.

---

### [HW-06] Validasi Kalibrasi 6-Pose Terlalu Ketat untuk Offset Gyro Bawaan & Pesan Error Menyesatkan
- **Tingkat**: **Menengah**
- **Lokasi**:
  - `hardware/avionics/firmware/include/imu_calibration.h` (baris 16–26, 57, 89)
  - `hardware/avionics/firmware/src/main.cpp` (baris 108–121)
- **Analisis Teknis**:
  1. `SixFaceCalibration::add()` menolak setiap sampel dengan `norm(gyro) >= 0.20 rad/s` (≈ `11.46 °/s`). Datasheet MPU6050 mengizinkan *initial zero-rate output* (bias pabrik mentah) hingga **±20 °/s** (≈ `0.35 rad/s`). Sensor MPU6050 asli/breakout yang memiliki bias mentah 12–20 °/s akan **gagal dikalibrasi selamanya (tertahan di 0/200)** meskipun benar-benar diam.
  2. Dalam `saveProfile()`, jika seluruh 6 sisi sudah terekam (`complete() == true`) tetapi `calibration.finish(next)` mengembalikan `false` (mis. `span > 2.4g` karena tiap sisi menerima sampai `1.25g`, sehingga `1.25 - (-1.25) = 2.50g > 2.4g`), firmware mencetak pesan error yang menyesatkan: `"Lengkapi enam posisi yang valid terlebih dahulu"`.
- **Rekomendasi Mitigasi**:
  - Gunakan deteksi kestabilan gyro berbasis **variansi/deviasi standar** dalam jendela sampel (dengan batas magnitudo absolut yang lebih longgar, mis. `0.40 rad/s` sesuai datasheet MPU6050), bukan ambang absolut `0.20 rad/s` pada data mentah.
  - Bedakan kode error antara "pose belum lengkap" vs "hasil offset/skala/span di luar batas wajar" pada `saveProfile()`.

---

### [HW-07] Duplikasi Objek `HardwareSerial(2)` Terhadap Global `Serial2`
- **Tingkat**: **Rendah**
- **Lokasi**:
  - `hardware/avionics/firmware/include/lora_radio.h` (baris 52–55)
  - `hardware/gcs/firmware/src/main.cpp` (baris 8)
- **Analisis Teknis**:
  - Core Arduino ESP32 sudah mendeklarasikan objek global `Serial2` untuk UART2 (`HardwareSerial Serial2(2)`). Mendeklarasikan ulang `HardwareSerial uart(2)` dan `HardwareSerial loRa(2)` menciptakan dua instance C++ berbeda yang mengakses register/driver UART2 yang sama. Jika pustaka lain atau kode di masa depan mengakses `Serial2`, dapat terjadi konflik buffer/ISR.
- **Rekomendasi Mitigasi**:
  - Gunakan referensi langsung ke `Serial2` yang disediakan core Arduino ESP32.

---

### [HW-08] Pembacaan Ganda Suhu BMP280 & Blocking `delay(100)` Saat Re-Init
- **Tingkat**: **Rendah**
- **Lokasi**:
  - `hardware/avionics/firmware/src/main.cpp` (baris 170–178, 283–288)
- **Analisis Teknis**:
  1. `readBmp()` memanggil `bmp.readTemperature()` lalu `bmp.readPressure()` setiap 100 ms. Di dalam library `Adafruit_BMP280`, `readPressure()` **sudah memanggil `readTemperature()` secara internal** untuk menghitung `t_fine`, sedangkan nilai `bmpTemperature` sendiri tidak pernah dikirim ke JSON (JSON memakai suhu die internal MPU6050).
  2. Ketika BMP280 terhubung kembali di tengah `loop()`, `initSensors()` menjalankan `delay(100)` yang menahan loop sampling IMU 100 Hz selama 100 ms (sehingga `sampleImu()` harus melakukan sub-stepping integrasi dengan 1 sampel tunggal).
- **Rekomendasi Mitigasi**:
  - Hindari pemanggilan `bmp.readTemperature()` yang redundan (atau ekspor `bmpTemperature` secara terpisah sebagai suhu ambient agar tidak rancu dengan suhu die MPU6050).
  - Ganti `delay(100)` pada inisialisasi BMP280 dengan state non-blocking berbasis `millis()`.
