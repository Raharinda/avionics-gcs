# Transmitter dan receiver ESP32 + Ebyte E32-433T30D

Firmware aktif menargetkan **E32-433T30D** pada kedua sisi:
[TX avionics](../hardware/avionics/firmware/README.md) dan
[RX GCS](../hardware/gcs/firmware/README.md). Driver dan perintah mode bersama
berada di `hardware/shared/e32_radio.h` dan `e32_commands.h`.
Pasang modul fisik E32-433T30D pada TX dan RX; mengganti firmware ESP32 tidak
mengubah modul E22 menjadi E32.

Acuan perangkat: [manual Ebyte E32-433T30D](https://fixaj.com/wp-content/uploads/2021/08/E32-433T30D_Usermanual_EN_v1.91.pdf).
Panduan lama E32-433T20D dengan AUX GPIO23 tidak berlaku untuk konfigurasi ini.

## Wiring dan profil

| E32 (TX maupun RX) | ESP32 |
| --- | --- |
| TXD | GPIO16 / RX2 |
| RXD | GPIO17 / TX2 |
| M0 | GPIO25 |
| M1 | GPIO26 |
| AUX | **GPIO27 / D27 pada TX dan RX (aktif)** |
| VCC | Catu 5 V stabil; batas modul 3,3–5,2 V |
| GND | GND bersama |

Sesuai koreksi wiring terbaru, AUX TX dan RX sama-sama GPIO27/D27.
TX memakai `-DE32_AUX_PIN=27`; POP_TEST_IN TX tetap dinonaktifkan.
Untuk pengujian tanpa AUX, gunakan `-DE32_AUX_PIN=-1`. Mode ini memakai guard
waktu tanpa memverifikasi kesiapan modul, dan tidak memperbaiki catu tidak stabil.

UART/AUX memakai logika 3,3 V. Jangan sambungkan M0/M1 ke GND langsung ketika
masih dikendalikan GPIO. Untuk M0/M1 yang langsung ke GND, lepaskan kabel
GPIO25/26 dan gunakan hanya NORMAL tetap, tanpa perintah pergantian mode. NORMAL saat boot berarti M0=M1=LOW. UART modul:
9600 8N1; USB: 115200. Firmware memakai parameter radio yang telah disimpan,
tanpa menulisnya ulang. Cocokkan alamat/channel/air rate/FEC dan mode transparan
pada dua modul E32. Profil acuan: alamat 0x0000, channel 0x17 (433 MHz),
air rate 2,4 kbps.

Mode E32 berbeda dari E22: `LORA_MODE:CONFIG` dan `SLEEP` memilih M0=M1=HIGH;
M0=LOW, M1=HIGH adalah `POWER_SAVING` (alias `WOR`), yang memerlukan TX dalam
mode `WAKEUP` (M0=HIGH, M1=LOW). `LORA_HELP` menjelaskan semua pilihan.
Pemilihan CONFIG tidak otomatis membaca/menulis register modul. Pengiriman
sensor otomatis pada firmware TX hanya berjalan di NORMAL; gunakan NORMAL
pada kedua node untuk uji telemetri ini.

## Build dan uji

```bash
./hardware/telemetry.sh build
./hardware/telemetry.sh flash tx /dev/ttyACM0
./hardware/telemetry.sh monitor tx /dev/ttyACM0
./hardware/telemetry.sh flash rx /dev/ttyUSB0
./hardware/telemetry.sh monitor rx /dev/ttyUSB0
```

Sesuaikan port masing-masing ESP32 dan tutup monitor sebelum flash. TX
menampilkan `E32-433T30D SENSOR TELEMETRY ROLE=TX` serta
`# E32 SENSOR TX packet=...` ketika sampel sensor dimasukkan ke UART radio,
sekitar setiap 2 detik. Log TX bukan ACK dari receiver.
Nilai numerik radio adalah rata-rata jendela pembacaan sejak kiriman lokal
berhasil sebelumnya: suhu dan accel/gyro pada laju IMU, tekanan pada laju
BMP dengan penghitung terpisah. AUX LOW/mode sibuk memperpanjang jendela;
encode atau penulisan UART gagal mempertahankan akumulasi. Log TX menambahkan
`average=ON imu_samples=... pressure_samples=... window_ms=...`.
`timestampMs` menandai akhir jendela. USB langsung dan filter orientasi tetap
memakai sampel langsung. Perubahan ini merangkum pembacaan dan tidak menjamin
setiap nilai asli atau paket radio dapat dipulihkan. Detail ada di
[firmware TX](../hardware/avionics/firmware/README.md).
Startup RX menampilkan `E32-433T30D SENSOR TELEMETRY ROLE=RX`.
Receiver mengumpulkan fragmen UART sampai newline, lalu meneruskan JSON sensor
ke USB. AUX LOW selama UART mengeluarkan data tetap diterima. Monitor mencetak
`# E32 RX frame=...` dan status setiap 10 detik. Matikan/hidupkan TX untuk
memastikan frame benar berasal dari link radio.

Tutup monitor sebelum memilih port receiver pada dashboard Tauri. Kalibrasi
dan acuan 3D tetap melalui USB langsung ke transmitter.

```bash
./hardware/telemetry.sh test
```

Tes host memeriksa framing JSON serta pemetaan mode dan transisi E32 dengan
AUX aktif/nonaktif. Build dan tes host belum membuktikan link RF pada perangkat.

## Setup parameter E32 lewat ESP32

`setup` memasang firmware konfigurator sementara pada ESP32, lalu ESP32
menulis parameter tersimpan E32 lewat UART. Firmware internal E32 tidak
diganti. Gunakan mode ini pada **kedua modul E32-433T30D** untuk menyamakan
profil. Profil identik untuk TX dan RX:

```text
C0 00 00 1A 17 44
```

Alamat `0x0000`, channel `0x17` (433 MHz), UART 9600 8N1, air rate 2,4 kbps,
transmisi transparan, FEC ON, output TXD/AUX push-pull dan daya 30 dBm.
Format perintah merujuk bagian 6.5 dan 7 pada
[manual E32-433T30D](https://fixaj.com/wp-content/uploads/2021/08/E32-433T30D_Usermanual_EN_v1.91.pdf).

**Matikan daya saat mengubah wiring. Untuk setup, lepaskan M0/M1 dari GND
langsung**, kemudian sambungkan seperti [gambar GPIO terbaru](gpioesp32.jpeg):

| Pin E32 | ESP32 yang terhubung ke modul itu |
| --- | --- |
| M0 | GPIO25 / D25 |
| M1 | GPIO26 / D26 |
| AUX | GPIO27 / D27 |
| TXD | GPIO16 / RX2 |
| RXD | GPIO17 / TX2 |
| GND | GND bersama ESP32 dan catu modul |

Pakai catu modul 5 V stabil dengan kapasitas arus yang memadai; logika
UART/M0/M1/AUX tetap 3,3 V. MPU boleh tetap terpasang; konfigurator tidak
membutuhkan atau membaca sensor. Lepaskan jumper UART langsung antar-ESP32
sebelum menghubungkan kembali TXD/RXD modul.

Tutup monitor yang sedang memakai port tersebut. Dari root repository:

```bash
./hardware/telemetry.sh setup tx /dev/ttyACM0
```

Perintah melakukan upload ke ESP32 TX dan membuka monitor otomatis. Bila
startup terlewat, tekan EN/RESET. Konfigurator memilih mode 3 (M0=M1=HIGH),
membaca parameter dengan `C1 C1 C1`, menyimpan profil dengan `C0` hanya jika
berbeda, lalu membaca ulang respons 6 byte. Respons salah/tidak ada atau
readback berbeda menghasilkan ERROR, bukan sukses. Semua penantian memiliki
timeout. Setelah readback cocok, pin dikembalikan ke NORMAL dan muncul:

```text
# E32_SETUP READ C0 00 00 1A 17 44
# E32_SETUP SUCCESS | READBACK cocok | NORMAL M0=0 M1=0
```

Keluar dengan Ctrl+C, lalu lakukan hal yang sama pada receiver:

```bash
./hardware/telemetry.sh setup rx /dev/ttyUSB0
```

Sesuaikan port. Konfigurator berjalan sekali per boot, tidak terus menulis
parameter. Jika profil sudah cocok, penulisan persisten dilewati. Jika gagal,
perbaiki wiring/catu lalu reset; jangan menganggap konfigurasi tersimpan telah
berhasil hanya karena upload firmware ESP32 selesai.

Setelah **kedua modul** menampilkan SUCCESS, keluar dari monitor dan pasang
kembali firmware telemetri (parameter E32 tetap tersimpan):

```bash
./hardware/telemetry.sh flash tx /dev/ttyACM0
./hardware/telemetry.sh flash rx /dev/ttyUSB0
./hardware/telemetry.sh monitor rx /dev/ttyUSB0
```

M0/M1 boleh kembali ke GND untuk NORMAL tetap setelah setup, asalkan dilepas
dari GPIO25/26 dan tidak memakai perintah pergantian mode. Build konfigurator
saja tanpa upload: `./hardware/telemetry.sh build-setup`.

## Tes UART kabel langsung dengan MPU

Gunakan ini untuk memisahkan pemeriksaan ESP32/UART dari link RF. Pada build
radio biasa, melepas AUX dapat menahan pengiriman TX meskipun JSON sensor USB
terus muncul. Build `uart_direct` mengabaikan AUX di kedua node, tetap membaca
MPU pada TX, dan meneruskan JSON ke UART2 9600 setiap sekitar 2 detik.

Matikan daya sebelum mengubah sambungan. Lepaskan GPIO17 TX dari RXD modul
LoRa TX dan GPIO16 RX dari TXD modul LoRa RX. Sambungkan langsung **GPIO17
ESP32 TX ke GPIO16 ESP32 RX**, serta **GND kedua ESP32**. Kabel MPU (SDA21/SCL22)
tetap terpasang pada TX. Modul LoRa dan AUX tidak diperlukan untuk tes ini.

Tutup monitor, lalu dari root repository:

```bash
./hardware/telemetry.sh flash-direct tx /dev/ttyACM0
./hardware/telemetry.sh flash-direct rx /dev/ttyUSB0
./hardware/telemetry.sh monitor rx /dev/ttyUSB0
```

Sesuaikan port dan biarkan kedua ESP32 tetap menyala bersamaan. Setelah reset,
startup menampilkan `UART_DIRECT_TEST ROLE=TX` atau `ROLE=RX` dan `AUX=unused`.
TX harus mencetak `# E32 SENSOR TX packet=...`, sedangkan RX harus menerima
JSON dan penghitung byte/frame bertambah. Hasil tes ini memverifikasi jalur
kabel, bukan transmisi radio. Jika RX tetap 0 byte, periksa kabel jumper,
GND bersama, pin, daya dan identitas board. Jika byte masuk tanpa frame lengkap,
periksa kestabilan sinyal dan baud.

Setelah pengujian, matikan daya, kembalikan wiring radio, lalu gunakan
`./hardware/telemetry.sh flash tx PORT_TX` dan `flash rx PORT_RX` untuk
memasang kembali build radio biasa dengan AUX GPIO27. Perintah `build-direct`
membangun tes kabel tanpa melakukan upload.
