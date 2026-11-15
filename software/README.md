# Avionics GCS desktop

Dashboard Tauri 2 + React untuk membaca sensor ESP32 melalui USB Serial. Akses
port dilakukan oleh backend Rust; frontend menerima data melalui Tauri Channel.
Firmware di `hardware/avionics/firmware` sudah kompatibel dengan pembaca ini.

## Menjalankan

Pasang Node.js, pnpm, Rust, dan dependency sistem Tauri terlebih dahulu. Pada
Debian/Kali, dependency build Linux dapat dipasang dengan:

```bash
sudo apt-get install -y pkg-config libgtk-3-dev libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev librsvg2-dev libdbus-1-dev libxdo-dev libssl-dev
```

Lihat [prasyarat Tauri](https://v2.tauri.app/start/prerequisites/) untuk OS lain.
Jika Rust dipasang lewat rustup dan `cargo` belum ditemukan, jalankan
`. "$HOME/.cargo/env"` di terminal yang akan dipakai.

```bash
cd ~/Documents/avionics-gcs/software
pnpm install --frozen-lockfile
pnpm tauri dev
```

`pnpm dev` hanya membuka frontend web. Gunakan **aplikasi desktop** dari
`pnpm tauri dev` untuk mengakses USB Serial. Mode **Dummy data** tetap dapat
berjalan melalui browser.

## Menghubungkan ESP32

1. Hubungkan ESP32 yang sudah berisi firmware sensor dengan kabel USB data.
2. Tutup PlatformIO Serial Monitor dengan **Ctrl+C** agar port tidak dipakai dua aplikasi.
3. Klik **Refresh ports** pada dashboard.
4. Pilih **Auto · USB** untuk memilih otomatis jika tepat satu perangkat USB
   Serial terdeteksi. Jika ada beberapa perangkat, pilih port ESP32 secara
   eksplisit: misalnya `/dev/ttyUSB0`, `/dev/ttyACM0`, atau `COM3`.
5. Klik **Connect** di sebelah pilihan port. Baud rate tetap **115200**, sesuai firmware.
6. Status **Waiting for data** berarti port sudah terbuka. Status **Receiving**
   berarti sampel sensor berhasil dibaca. Sampel pertama membutuhkan satu frame
   lengkap; decoder menyelesaikan frame saat timestamp berikutnya tiba.
7. Klik **Disconnect** untuk menutup port. Port juga dilepas ketika jendela aplikasi ditutup.

Tidak perlu flash ulang untuk integrasi ini jika ESP32 sudah menampilkan format
MPU6050/BMP280 dari firmware dalam repo. D21 tetap SDA dan D22 tetap SCL.
Koneksi yang didukung saat ini adalah **ESP32 avionics langsung ke laptop via USB**;
relay ESP-NOW melalui ESP32 GCS belum diimplementasikan.

Jika port gagal dibuka, tutup monitor lain dan periksa izin perangkat Serial OS.
Aplikasi menampilkan kesalahan pembukaan port atau putusnya perangkat. Tidak ada
reconnect otomatis setelah kabel terputus; sambungkan lagi, Refresh ports, lalu Connect.

## Data yang ditampilkan

- Suhu BMP280 dan MPU6050 dalam °C; tekanan BMP280 dalam kPa (hPa dibagi 10).
- Besar percepatan dalam g (m/s² dibagi 9,80665), serta sumbu Z dalam g.
- Besar kecepatan sudut dalam °/s (konversi dari rad/s).
- Detail sumbu X/Y/Z accelerometer dan gyro tetap ditampilkan dalam satuan asli.
- Altitude adalah **estimasi barometrik relatif** terhadap tekanan pertama sesi,
  bukan altitude GPS atau tinggi absolut. Koneksi baru atau uptime ESP32 yang
  kembali ke nol mereset referensi. Descent estimate dihitung dari perubahan
  altitude antar-sampel; positif berarti turun. Nilainya peka terhadap noise tekanan.
- Roll/pitch adalah estimasi kemiringan berdasarkan gravitasi; gerakan dan getaran
  memengaruhi hasil. Yaw dan GPS belum tersedia.
- Sensor yang tidak memberikan data ditampilkan sebagai `—`. Setelah 3 detik tanpa
  sampel, status menjadi **No recent data** dan nilai terakhir ditandai **STALE**.
- Received samples menghitung frame valid yang diterima, bukan nomor paket radio.
  Format firmware saat ini tidak menyediakan sequence number untuk menghitung paket hilang.
- Grafik menyimpan maksimal 120 sampel terbaru (sekitar satu menit pada interval
  500 ms). **Download CSV** mengekspor jendela data tersebut; ini bukan perekaman sesi penuh.
- Expand log menampilkan maksimal 80 baris Serial terakhir. Decoder membatasi
  panjang baris 512 byte; raw log dibatasi 20 baris/detik.

Firmware ini hanya menyediakan pembacaan sensor. Tombol Arm/Fire dinonaktifkan
untuk perangkat asli; demonstrasinya hanya tersedia pada Dummy data dan tidak
mengirim perintah ke hardware.

## Pemeriksaan

```bash
pnpm test
pnpm build
cd src-tauri
cargo check --locked
cargo test --locked
```

Parser Rust memiliki tes format Serial asli, potongan byte, sensor hilang,
restart perangkat, dan baris rusak. Tes frontend memeriksa satuan, referensi
altitude, nilai kosong, nilai tidak valid, serta estimasi kemiringan.

Parser juga dapat diuji tanpa dependency GTK/WebKit, dari folder `software`:

```bash
rustc --test --edition=2024 src-tauri/src/telemetry.rs -o /tmp/avionics-telemetry-tests
/tmp/avionics-telemetry-tests
```

Pengujian desktop dengan ESP32 fisik tetap diperlukan setelah dependency Linux
terpasang. Tes parser dan build frontend tidak memverifikasi koneksi hardware.
