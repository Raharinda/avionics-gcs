# Avionics GCS desktop

Dashboard Tauri 2, React, TypeScript, dan Three.js. Akses USB Serial dilakukan
oleh backend Rust.

Struktur komponen dan aliran data dijelaskan di [ARCHITECTURE.md](ARCHITECTURE.md).

Jalankan dari direktori ini:

```bash
pnpm install --frozen-lockfile
pnpm tauri dev
```

Gunakan jendela aplikasi desktop untuk akses serial. Halaman Vite di browser
biasa hanya menampilkan UI dan simulasi. Untuk Linux Debian/Kali, dependency
native berikut diperlukan sebelum build desktop:

```bash
sudo apt install -y build-essential pkg-config libdbus-1-dev libudev-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libayatana-appindicator3-dev \
  librsvg2-dev libxdo-dev libssl-dev
```

Deteksi USB menampilkan `Connected at PORT` sebelum Start, terpisah dari
pilihan sumber data. Setelah Start, status menjadi `Streaming at PORT`
atau `Streaming at Dummy Data` sesuai sumber yang sedang berjalan.

Model 3D mengikuti quaternion dari firmware `imu3d-v2` setelah kalibrasi enam
pose dan penetapan acuan awal. Profil disimpan pada ESP32. Ikuti
[panduan kalibrasi, logika orientasi, dan protokol serial](../docs/imu-orientation.md).

```bash
pnpm test              # Validasi protokol kalibrasi
pnpm build             # TypeScript dan bundle frontend
pnpm tauri build       # Build aplikasi desktop distribusi
```
