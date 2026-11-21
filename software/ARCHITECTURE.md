# Struktur frontend dan batas komponen

Atomic design dipakai pada bagian yang memiliki tanggung jawab atau pemakaian
ulang yang jelas. Panel tetap utuh; teks, setiap tombol, dan setiap pembungkus
tidak dipecah menjadi komponen tersendiri.

```text
src/
  App.tsx                         Pintu masuk dan stylesheet yang sudah ada
  pages/TelemetryDashboard.tsx    Menghubungkan data dan panel dashboard
  components/
    atoms/                        Card, Icon
    molecules/                    SensorCard, TelemetryChart, MetricCard,
                                  LaptopClock, RocketViewport, RocketModel3D
    organisms/                    Header, panel roket, panel perintah, peta,
                                  grid sensor, metrik, log, dialog kalibrasi
    templates/DashboardLayout.tsx Susunan HTML dashboard
  hooks/
    useDashboardController.ts    Koordinasi telemetry, kalibrasi, ekspor, perintah
    useSerialConnection.ts       Pemilihan port, Start/Stop, deteksi USB
    useTelemetry.ts              Data telemetry dan cache per sumber
    useImuCalibration.ts         Protokol dan konfirmasi kalibrasi ESP32
    useSerialLog.ts              Buffer log dan pembaruan panel log
    useTelemetryFreshness.ts     Kedaluwarsa data orientasi
    useSampledValue.ts           Sampling data untuk grafik
  services/serialConnection.ts   Pemanggilan perintah serial Tauri
  visualization/
    createRocketScene.ts         Geometri, kamera, interaksi, resource WebGL
    renderScheduler.ts           Penjadwalan frame saat diperlukan
  data/                         Protokol, perhitungan sumbu, buffer log
  types/                        Bentuk data telemetry, serial, dan visualisasi
```

## Aliran data

ESP32 → backend Rust → event telemetry → `useTelemetry` → panel dashboard.
Setiap klik Start yang membuka listener serial baru menetapkan tekanan barometer
valid pertama sebagai acuan ketinggian 0 m. Altitude selanjutnya relatif terhadap
acuan sesi itu, termasuk pada ekspor CSV. Jika tekanan belum valid, altitude
tetap kosong; putusnya pembacaan barometer tidak mengganti acuan sesi.
Event serial mentah ditampung oleh `useSerialLog` dan hanya memperbarui panel
log, sehingga setiap baris serial tidak memicu render seluruh dashboard.
Perintah kalibrasi tetap menunggu konfirmasi dari firmware. Pemisahan komponen
tidak menambah perintah perangkat atau mengubah rangkaian kontrol yang ada.

## Pengurangan kerja render

- Three.js dan Recharts dimuat melalui import dinamis. Dialog kalibrasi baru
  dimuat ketika dibuka. Ini mengecilkan bundle utama; library yang diperlukan
  oleh tampilan aktif tetap harus diunduh dan diparsing.
- Jam laptop menyimpan timer di komponennya sendiri. Panel yang menerima props
  tetap menggunakan `memo`; callback transport dan tindakan kalibrasi stabil.
- Orientasi roket, angka barometer, dan jumlah paket mengikuti paket telemetry
  yang masuk. Grafik suhu/tekanan memakai snapshot terbaru setiap 250 ms.
  Khusus angka dan grafik gyroscope/accelerometer memakai snapshot setiap
  1000 ms, sehingga jeda tampilan tidak memperlambat pembacaan sensor atau
  orientasi roket. Riwayat seluruh telemetry tetap mempertahankan 120 titik.
  Snapshot dibersihkan saat data kosong atau sumber berganti. Animasi transisi
  garis dinonaktifkan agar tidak bertumpuk saat paket terus masuk.
- Log mempertahankan maksimum 200 baris dan frame parsial maksimum 200 baris.
  Riwayat diperbarui maksimal empat kali per detik; tampilan frame mentah tetap
  diperbarui setiap satu detik. Buffer tidak menyalin riwayat yang tidak berubah.
- Scene 3D meminta frame ketika input, ukuran canvas, atau kamera berubah.
  Interpolasi quaternion dan damping kamera berlanjut sampai selesai, kemudian
  berhenti. Scene dijeda ketika halaman tersembunyi, canvas di luar viewport,
  atau panel utama tertutup dialog kalibrasi. Listener, observer, frame, material,
  tekstur, dan geometri dibersihkan ketika scene dilepas.

## Menjaga desain

`App.css` dipertahankan. `DashboardLayout` dan panel memakai elemen, class,
urutan bagian, teks, geometri 3D, dan parameter kamera yang sudah ada.
`tests/layout-preservation.test.mjs` membandingkan hasil HTML awal dengan fixture
sebelum refaktor dan memeriksa hash stylesheet. Komentar internal Suspense dan
whitespace antar elemen diabaikan. Ini memeriksa struktur HTML; verifikasi
render piksel di desktop tetap diperlukan untuk memeriksa driver WebGL/WebKit.
Jika desain sengaja diubah pada tugas berikutnya, baseline harus diperbarui
melalui review perubahan desain tersebut.

```bash
pnpm test
pnpm build
```

Tes tambahan mencakup buffer serial saat input besar, frame saat idle,
penggabungan beberapa invalidasi, jeda/resume, cleanup, dan penyelesaian
interpolasi quaternion. Pengujian protokol kalibrasi dan 24 pemasangan sumbu
tetap dijalankan.
