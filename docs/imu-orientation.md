# Kalibrasi XYZ dan orientasi 3D relatif

Fitur ini memakai MPU6050 di ESP32 DevKit klasik untuk memperkirakan orientasi
roket relatif terhadap pose awal yang dipilih operator. BMP280 tetap memasok
tekanan udara. Arah utara dan posisi XYZ dalam meter tidak diukur.

## Cara mencoba

1. Tutup Serial Monitor dan hentikan koneksi GCS sebelum flash. Firmware lama
   harus diganti dengan firmware yang mencetak banner `imu3d-v2`:

   ```bash
   cd ~/Documents/avionics-gcs/hardware/avionics/firmware
   ./firmware.sh flash /dev/ttyUSB0
   ```

   Ganti port sesuai hasil `./firmware.sh ports`, misalnya `/dev/ttyACM0`.
2. Jalankan desktop dari `software/` dengan `pnpm tauri dev`. Buka jendela
   desktop yang muncul, pilih port ESP32, lalu klik **Start**.
3. Klik **Kalibrasi XYZ / tetapkan acuan** pada Rocket view. Pilih
   **Mulai enam posisi**. Ikuti panah sumbu pada papan MPU6050, bukan arah layar.
4. Pilih **+X ke atas**, posisikan sumbu +X papan benar-benar menghadap atas,
   lalu klik **Rekam +X**. Tahan diam sampai 200 sampel stabil selesai.
   Ulangi untuk −X, +Y, −Y, +Z, dan −Z. Target waktu sekitar 2 detik per pose;
   gangguan atau gerakan akan memperpanjang waktu karena hitungan diulang.
   Posisi dapat diambil dalam urutan apa pun.
5. Setelah enam pose valid, ESP32 menyimpan profil dan mengirim konfirmasi.
   Tabel dalam dialog menampilkan rata-rata tiap pose, offset, skala, dan bias
   gyro yang benar-benar dibaca kembali dari ESP32.
6. Pilih sumbu sensor yang mengarah ke **hidung** dan **sisi kanan** roket.
   Contoh pemasangan awal: hidung +Z sensor, kanan +X sensor. Kedua sumbu
   harus tegak lurus. Pilihan ini menyesuaikan model dengan pemasangan papan.
7. Pegang roket pada pose awal yang kamu inginkan, tahan diam, lalu klik
   **Tetapkan posisi sekarang sebagai acuan**. Pose tersebut menjadi nol 3D.
   Gerakkan roket: model mengikuti rotasi relatif terhadap pose tadi.
   Drag pada model mengubah kamera; scroll mengubah zoom.

Data Dummy hanya menampilkan simulasi. Kalibrasi dan penyimpanan profil
memerlukan koneksi ESP32 asli. Status live memerlukan data baru, profil valid,
dan konfirmasi acuan aktif dari ESP32. Ketika data berhenti, model terakhir
diredupkan dan angka orientasi ditampilkan sebagai `—`.

### Jika hitungan tertahan di 0/200

Diam saja belum cukup: sumbu yang diminta harus menghadap atas. Contohnya,
`accelX ≈ 0,66`, `accelY ≈ −0,26`, `accelZ ≈ 9,23 m/s²` menunjukkan +Z
ke atas. Data ini sesuai untuk pose +Z, tetapi ditolak bila merekam +X.
Untuk +X, putar papan sampai panah +X tegak ke atas, lalu berhenti dan tahan
diam selama perekaman. Putar ke pose berikutnya setelah pose ini selesai.

Dialog menampilkan nilai XYZ, besar gyro, dan petunjuk seperti “Terbaca +Z
ke atas, sedangkan yang direkam +X”. Petunjuk memakai telemetry yang masih
baru; jumlah sampel dan hasil kalibrasi tetap berasal dari ESP32. Saat
kalibrasi ulang, telemetry dapat sudah dikoreksi oleh profil lama, sedangkan
perekaman menggunakan sampel mentah; dialog menjelaskan perbedaan ini.

## Logika perhitungan

### 1. Enam pose mengukur kesalahan sensor

Akselerometer yang diam merasakan gravitasi sekitar 9,80665 m/s². Saat sumbu
+X menghadap atas, sumbu itu seharusnya membaca +g; saat −X menghadap atas,
seharusnya −g. Hal yang sama berlaku untuk Y dan Z.

Untuk setiap sumbu, dengan rata-rata pembacaan mentah `a_plus` dan `a_minus`:

```text
offset = (a_plus + a_minus) / 2
scale  = (2 × g) / (a_plus - a_minus)
a_corrected = (a_raw - offset) × scale
```

Gyro saat diam seharusnya mendekati nol. Rata-rata gyro dari keenam pose
menjadi bias yang dikurangi dari pembacaan berikutnya. Ini mengoreksi **bias
gyro**, bukan mengkalibrasi skala kecepatan sudutnya.

Firmware mengambil 200 sampel berturut-turut per pose, memeriksa arah sumbu,
besar percepatan, kecepatan putar, dan variasi percepatan. Gerakan besar atau
pose salah mereset jendela sampel. Profil baru hanya menggantikan profil lama
setelah semua enam pose lolos validasi dan penyimpanan berhasil. Batal atau
sensor gagal tidak membuat profil setengah jadi dianggap selesai.

### 2. Gabungkan gyro dan arah gravitasi

Target pembacaan IMU sekitar 100 Hz. Gyro menghasilkan kecepatan sudut rad/s;
firmware mengintegrasikannya menggunakan selang waktu aktual. Akselerometer
memberikan arah gravitasi untuk koreksi kemiringan proporsional. Ketika besar
percepatan jauh dari g, koreksi gravitasi dihentikan agar percepatan linear
besar tidak langsung dianggap sebagai kemiringan.

Orientasi disimpan sebagai **quaternion**, empat angka `[w, x, y, z]` yang
mewakili rotasi 3D. Ini memungkinkan model melewati posisi vertikal dan
terbalik tanpa ketergantungan pada singularitas sudut Euler. Angka X/Y/Z di
dashboard adalah hasil konversi Euler urutan ZYX untuk dibaca manusia; angka
tersebut dapat berubah tajam dekat singularitas walaupun model tetap kontinu.

### 3. Pose pilihan operator menjadi nol

Saat tombol acuan dikonfirmasi, firmware mencatat `q_reference`. Selanjutnya:

```text
q_relative = inverse(q_reference) × q_current
q_model = q_mount × q_relative × inverse(q_mount)
```

`q_mount` memetakan pemasangan sensor ke sumbu model: **X ke kanan, Y ke
hidung**, dan Z mengikuti kaidah tangan kanan. Saat acuan baru ditetapkan,
`q_relative` identitas sehingga model kembali ke pose nol. Label `REF +Y`
dan grid adalah kerangka acuan visual ini; keduanya bukan indikator arah
gravitasi fisik apabila operator memilih pose awal miring.

ESP32 mengirim quaternion model melalui USB Serial sekitar 10 Hz. Backend
Rust memvalidasi quaternion, menambahkan asal port, lalu mengirim event ke
React. Three.js memakai quaternion tersebut dan menghaluskan transisi antar
paket. BMP280 dibaca sekitar 2 Hz dan tidak menentukan orientasi model.

## Apa yang disimpan

Preferences/NVS ESP32, namespace `imu-cal-v2`, menyimpan:

- Profil versi 2: offset dan skala XYZ akselerometer, bias XYZ gyro, jumlah
  sampel, serta rata-rata accelerometer/gyro keenam pose.
- Pilihan sumbu hidung dan kanan.
- Catatan acuan terakhir: quaternion, vektor gravitasi terukur, dan sumbu
  pemasangan pada saat acuan ditetapkan.

Profil dimuat setelah reboot. **Catatan acuan lama hanya menjadi riwayat**;
acuan aktif harus ditetapkan ulang karena integrasi gyro memulai sesi baru
tanpa heading absolut. Kalibrasi baru menghapus catatan acuan lama.
Memutus Start/Stop tanpa mereset ESP32 tidak otomatis menghapus acuan aktif.
Profil kalibrasi satu pose dari firmware lama tidak dipakai sebagai profil
enam pose.

## Batas pengukuran

MPU6050 tidak memiliki magnetometer. Putaran heading/yaw relatif dapat drift
karena bias gyro yang tersisa; tetapkan ulang acuan bila perlu. Koreksi arah
gravitasi juga tidak dapat membedakan semua percepatan linear dari kemiringan.
Rentang sensor, getaran, suhu, dan pemasangan memengaruhi akurasi. Fitur ini
perlu diuji pada perangkat dan gerakan nyata; kelulusan tes matematika dan
build belum membuktikan akurasi selama penerbangan.

## Protokol serial

Semua perintah berupa satu baris teks diakhiri newline, 115200 baud.

| Perintah | Hasil |
| --- | --- |
| `IMU_STATUS` | `IMU_STATE:` JSON dan `CALIBRATION_STATUS:` JSON |
| `CALIBRATE_START` | Memulai sesi enam pose; profil lama tetap tersimpan |
| `CALIBRATE_FACE:XP` | Mengambil +X; pilihan lain `XM`, `YP`, `YM`, `ZP`, `ZM` |
| `CALIBRATE_CANCEL` | Membatalkan sesi yang sedang berjalan |
| `CALIBRATE_FINISH` | Mencoba simpan ulang jika enam pose sudah lengkap |
| `IMU_MOUNT:3,1` | Menyimpan hidung +Z dan kanan +X; perubahan membatalkan acuan |
| `IMU_REFERENCE:3,1` | Validasi pemasangan dan tetapkan pose sekarang sebagai acuan |
| `IMU_REFERENCE` | Tetapkan acuan dengan pemasangan yang sudah tersimpan |

`CALIBRATION_ERROR:` melaporkan penolakan atau kegagalan penyimpanan.
`CALIBRATION_COMPLETE:` baru dikirim setelah profil tersimpan.
`REFERENCE_SET:` diikuti `IMU_STATE:` mengonfirmasi acuan aktif.

Telemetry berupa JSON tanpa awalan, misalnya (ilustrasi):

```json
{"timestampMs":42000,"temperature":30.2,"pressure":994.4,"accelX":0.01,"accelY":0.02,"accelZ":9.806,"gyroX":0.0,"gyroY":0.0,"gyroZ":0.0,"imuValid":true,"calibrated":true,"referenceSet":true,"orientation":[1,0,0,0]}
```

Saat belum ada acuan, `orientation` bernilai `null`. Kegagalan I2C ditandai
`imuValid:false` dan sampel tersebut tidak diterbitkan sebagai telemetry
valid oleh backend. BMP280 yang tidak tersedia menghasilkan `pressure:null`
dan altitude kosong, tanpa mematikan orientasi MPU yang masih valid.

## Verifikasi pengembangan

```bash
# Dari hardware/avionics/firmware
./test-host.sh
./firmware.sh build

# Dari software
pnpm test
pnpm build

# Dari software/src-tauri
cargo test --locked --offline --lib
cargo check --locked --offline
```

Tes host mencakup kegagalan baca MPU, koreksi enam pose, profil tidak lengkap,
24 pilihan pemasangan sumbu, inisialisasi terbalik, koreksi gravitasi, putaran
gyro 360°, dan transformasi acuan. Tes parser/frontend dan Rust mencakup
profil invalid, metadata acuan, quaternion, dan sensor yang tidak tersedia.
