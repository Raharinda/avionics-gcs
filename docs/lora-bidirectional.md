# LoRa dua arah dan pulsa D19

Software mengikuti `origin/dev` commit `08f35c3`, dengan kalibrasi, profil,
acuan RFU, dan konfigurasi hardware lokal dipertahankan. Kontrol D19 memakai
protokol berikut, menggantikan FIRE berdurasi tetap pada versi dev.

Alur: GCS Tauri → USB ESP32 GCS → E32 → ESP32 avionics → GPIO19.
ACK kembali melalui E32 dan USB. Kedua modul harus NORMAL dengan parameter
radio yang cocok. Pin UART, M0/M1, AUX D27, I2C, dan tombol tetap mengikuti
[konfigurasi lokal](hardware-pinout.md).

## Pemakaian

1. Build dan flash firmware terbaru pada **kedua ESP32**:

   ```bash
   ./hardware/telemetry.sh flash tx PORT_AVIONICS
   ./hardware/telemetry.sh flash rx PORT_GCS
   ```

2. Jalankan `pnpm tauri dev` dari `software`, pilih port ESP32 GCS, lalu Start.
3. Isi **Durasi pulsa D19 (ms)** di panel COMMAND. Default **200 ms**, rentang
   bilangan bulat **1–10000 ms**. Pilihan durasi berlaku untuk FIRE berikutnya.
4. Arm system, lalu FIRE. GPIO19 avionics menjadi HIGH (logika 3,3 V) selama
   durasi tersebut dan kembali LOW lewat timer lokal ESP32. Boot juga LOW.
5. FIRED hanya muncul setelah ACK dengan ID dan durasi yang sesuai. ACK
   berarti firmware sudah menjalankan perintah/menjadwalkan timer; ACK tidak
   mengukur tegangan atau membuktikan beban eksternal bekerja. Pulsa pendek
   dapat sudah selesai sebelum ACK tiba.
6. Reset meminta LOW segera saat perintah diterima avionics. SAFE baru
   dikonfirmasi setelah ACK LOW. Stop/pindah port menghentikan sesi software;
   pulsa yang sudah dimulai tetap diselesaikan timer avionics. Dummy Data
   tidak mengaktifkan kontrol hardware.

## Protokol

Semua pesan satu baris dengan newline, ID 16 karakter heksadesimal kecil:

```text
D19_CMD:0123456789abcdef:200
D19_ACK:0123456789abcdef:200
D19_CMD:fedcba9876543210:0
D19_ACK:fedcba9876543210:0
```

Durasi 0 khusus LOW/Reset. GCS menampilkan `D19_QUEUED` dan `D19_SENT`
sebagai status lokal, lalu menunggu ACK dari avionics. Receiver mencoba
maksimal tiga kiriman dengan jeda minimal 3100 ms dan batas waktu total
15 detik; UI menunggu maksimal 18 detik. Ini berbagi kanal half duplex
dengan telemetri, jadi respons bukan seketika. ACK diprioritaskan terhadap
telemetri. Tanpa ACK, UI menampilkan UNCONFIRMED dan dapat meminta Reset.

Avionics menyimpan 16 ID terakhir selama boot untuk menolak eksekusi ulang.
Retry ID yang sama tidak memperpanjang/memulai ulang pulsa; retry FIRE lama
setelah Reset tidak menyalakan D19 lagi. Reset menggantikan FIRE yang masih
menunggu di receiver. Baris rusak, terlalu panjang, ID tidak valid, dan durasi
di luar batas ditolak. Kalibrasi tetap memakai USB langsung ke avionics.

Uji tanpa perangkat: `./hardware/avionics/firmware/test-host.sh`,
`./hardware/gcs/firmware/test-host.sh`, `pnpm test` dan `pnpm build` di
`software`, serta `cargo test --offline` di `software/src-tauri`.
Validasi durasi/tegangan fisik dilakukan pada D19 avionics dengan osiloskop
atau logic analyzer setelah flash; unit test tidak mengukur pin fisik.

## Hasil validasi jalur D19

Pembanding adalah implementasi `origin/dev` commit `08f35c3`: output memakai
`pinMode(19, OUTPUT)` dan `digitalWrite(19, HIGH/LOW)`. Firmware dev menetapkan
`kFirePulseMs=10000` (**10 detik**), sedangkan log software dev menyebut
100 ms. Pengguna melaporkan implementasi dev sudah berhasil pada perangkat;
laporan itu tidak menetapkan bahwa durasi 200 ms cukup untuk beban eksternal.
Versi ini mempertahankan cara menggerakkan D19, lalu menambahkan pengiriman
command dan ACK lewat E32 beserta durasi yang dapat dipilih. Konfigurasi
hardware serta kalibrasi lokal dipertahankan.

Versi ini menggunakan durasi yang benar-benar dikirim UI (default 200 ms),
bukan tulisan durasi pada log versi dev. Keberhasilan aktivasi beban dengan
10 detik tidak membuktikan kecukupan energinya pada 200 ms; pilihan durasi
tersedia sampai 10000 ms untuk disesuaikan berdasarkan pengujian perangkat.

| Pemeriksaan | Hasil |
| --- | --- |
| D19 tidak dipakai UART 16/17, M0/M1 25/26, AUX 27, atau I2C 21/22 | Lulus audit konfigurasi lokal |
| Command GCS → buffer terfragmentasi → avionics → HIGH → ACK balik ke GCS | Lulus simulasi kedua endpoint dengan komponen protokol asli |
| ACK pertama hilang dan command dikirim ulang | Lulus; hanya satu aktivasi pulsa |
| Reset diikuti retry FIRE lama | Lulus; output tetap LOW |
| AUX sibuk dan mode SLEEP | Lulus; tidak mengaku command sudah terkirim/diterima |
| Durasi 1, 100, 200, 1000, 10000 ms | Lulus timer adapter dengan jam dan callback simulasi |
| Timer gagal dibuat / gagal dijadwalkan | Lulus; Reset tetap LOW dan scheduling gagal tidak menghasilkan tepi HIGH |
| Callback lama datang setelah pulsa baru dimulai | Lulus; pulsa baru tidak dipotong callback lama |
| Build firmware ESP32 TX dan RX | Lulus PlatformIO `esp32dev` |
| Ukuran tegangan, lebar pulsa aktual, MOSFET/beban, kehilangan paket RF | Belum diukur pada perangkat di sesi ini |

GPIO19 adalah pin I/O pada ESP32 klasik yang dipakai proyek ini. Tegangan
HIGH termasuk kelas logika 3,3 V; bukan sumber tegangan presisi 3,300 V.
Datasheet memberikan minimum VOH 0,8 × VDD (2,64 V jika VDD 3,3 V), sehingga
kecocokan driver/beban harus berdasarkan spesifikasi input/gate dan kondisi
bebannya. Lihat [datasheet ESP32, pin dan karakteristik DC](https://documentation.espressif.com/esp32_datasheet_en.html).
D19 merupakan output kontrol lokal di avionics; radio dua arah tetap lewat
UART GPIO16/17. Jalur ACK tidak melalui D19.

Timer memakai `esp_timer` dengan callback task, bukan pembangkit waveform
hard real-time. Lebar pulsa nominal dijadwalkan lokal dan tetap dapat memiliki
jitter dispatch; target 1 ms khususnya harus diukur sebelum dipakai sebagai
persyaratan waktu ketat. Lihat [dokumentasi ESP Timer](https://docs.espressif.com/projects/esp-idf/en/stable/esp32/api-reference/system/esp_timer.html).

Untuk pembuktian perangkat: pilih durasi 100, 200, dan 1000 ms, ukur D19
terhadap GND avionics, dan cocokkan setiap aktivasi dengan satu ACK di GCS.
Ulangi sambil telemetri berjalan, setelah Reset, dan dengan link terputus;
tanpa ACK UI harus UNCONFIRMED. Verifikasi pula bahwa naiknya tegangan D19
tidak mengakibatkan reboot/brownout saat rangkaian eksternal aktif.
