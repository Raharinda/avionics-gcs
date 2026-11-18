# ESP32 + Ebyte E22-400T30D: konfigurasi, PING, dan telemetri

Modul fisik pengguna adalah **E22-400T30D**. Panduan RYLR998 dan E32 sebelumnya
adalah arsip untuk perangkat berbeda. Manual yang berlaku:
[manual resmi E22](E22-400T30D_UserManual_EN_official.pdf), diunduh dari
[Ebyte](https://www.cdebyte.com/pdf-down.aspx?id=1489).

## Wiring dan mode pin

| E22-400T30D | ESP32 DevKit/WROOM klasik                 |
| ----------- | ----------------------------------------- |
| RXD         | TX2 / GPIO17                              |
| TXD         | RX2 / GPIO16                              |
| AUX         | GPIO23, sebagai input                     |
| GND         | GND ESP32 pada node yang sama             |
| VCC         | Catu modul yang stabil, lihat bagian daya |

| Penggunaan                        | M0  | M1  |
| --------------------------------- | --- | --- |
| PING / telemetri normal           | GND | GND |
| Membaca / menulis konfigurasi E22 | GND | 3V3 |
| Deep sleep                        | 3V3 | 3V3 |

**Matikan daya sebelum memindahkan jumper.** Lepaskan jumper loopback GPIO16–17
dan GPIO23–3V3 sebelum memasang kembali LoRa. AUX modul harus kembali ke GPIO23.
Jangan menyambungkan M0 ke 3V3 untuk konfigurasi E22: kedua pin HIGH memilih tidur.

USB Serial ESP32 ke laptop tetap **115200 baud**. UART konfigurasi E22 selalu
**9600 baud 8N1**. UART data normal bergantung register tersimpan; profil tes
dan firmware proyek ini memakai **9600 baud 8N1**.

## Daya: koreksi dari E32

E22-400T30D adalah modul **30 dBm / 1 W RF**, berbeda dari E32-433T20D.
Manual resmi mencantumkan VCC 3,3–5,5 V, 5 V tipikal, dan arus TX sekitar
**610 mA**. Untuk uji transmisi, gunakan catu **5 V teregulasi dengan kapasitas
setidaknya 1 A** untuk modul, dengan margin bagi beban lain. Angka 1 A adalah
rekomendasi kapasitas catu, bukan arus konstan modul.

Catu 3,3 V tetap dapat dicoba jika regulator memadai dan tegangan pada modul
stabil; jangan menganggap regulator 3V3 board ESP32 cukup. Menurunkan daya RF
tidak menurunkan arus secara proporsional menurut manual. GPIO/UART/AUX/M0/M1
tetap berlevel **3,3 V**, dan sensor MPU6050/BMP280 tetap diberi catu sesuai
breakout. Semua GND pada satu node harus disatukan. Pasang antena sebelum TX.

## 1. Baca konfigurasi terlebih dahulu

Dengan M0=GND dan M1=3V3, gunakan skrip yang benar:

```bash
cd /home/aqilarrafi/Documents/avionics-gcs/hardware/radio-test/firmware
./firmware.sh build config
./firmware.sh flash config /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Sesuaikan port. Build `config` **hanya membaca**, tidak menulis pengaturan.
Perintah E22 adalah `C1 00 09`: baca 9 register mulai alamat 00H. Balasan valid
terdiri dari **12 byte**, diawali `C1 00 09`, bukan enam byte C0/C2 milik E32.

Contoh hasil setelah profil tes diterapkan (ilustrasi, bukan hasil perangkat):

```text
# CONFIG READ -> C1 00 09
CONFIG HEX: C1 00 09 00 00 00 62 03 17 03 00 00
CONFIG ADDR=0x0000 NETID=0 UART=9600 8N1 CHAN=0x17 RF_MHz=433.125 AIR_BITS=2 PACKET=240 MODE=TRANSPARENT POWER=21dBm RSSI_BYTE=OFF REPEATER=OFF LBT=OFF
```

Decoder mengikuti register E22: ADDH/ADDL pada 00H/01H, NETID 02H, REG0 03H,
REG1 04H, channel 05H, REG3 06H, CRYPT_H/L 07H/08H. UART/parity, daya dan flag
transmisi memiliki letak bit berbeda dari E32. E22 tidak memakai field FEC
dari decoder E32 lama.

**CRYPT_H/L hanya bisa ditulis; hasil baca nol tidak membuktikan key tersimpan
nol.** Bandingkan alamat, NETID, channel, air rate, mode dan flag RSSI kedua
modul; jika key tidak diketahui, mode setup di bawah meminta key tes yang sama.

Jika belum membalas, periksa mode 2 E22 dan wiring pada kaki modul. Tes loopback
yang sukses hanya membuktikan UART ESP32, bukan protokol/keadaan/catu E22.

## 2. Samakan profil kedua E22 jika diperlukan

Build `setup` **menulis profil tes permanen ke E22**, satu kali per boot,
kemudian meminta pembacaan ulang. Gunakan pada masing-masing modul dengan
M0=GND dan M1=3V3:

```bash
./firmware.sh build setup
./firmware.sh flash setup /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

Perintah yang diterapkan:

```text
C0 00 09 00 00 00 62 03 17 03 00 00
```

Profil: alamat 0000, NETID 0, UART 9600 8N1, air rate 2,4 kbps, paket 240 byte,
daya **21 dBm**, channel 23 (**433,125 MHz**), transparan, byte RSSI/repeater/LBT
OFF, dan permintaan key 0000. Channel ini adalah contoh bawaan untuk pengujian;
sesuaikan penggunaan radio dengan lokasi/perangkat.

Tunggu `SETUP ACK HEX:` yang valid, kemudian **`SETUP VERIFIED`** setelah
register publik dibaca ulang dan cocok. Echo perintah C0, balasan terpotong,
atau isi berbeda tidak dihitung sebagai verifikasi. Key tidak dapat dibaca
ulang; log membedakan permintaan tulis key dari verifikasi register publik.
Tidak ada pengiriman PING dalam mode config/setup.

## 3. Buktikan link dengan PING tanpa sensor

Setelah membaca/menyetel kedua modul, **matikan daya** dan kembalikan M0/M1
keduanya ke GND. Flash masing-masing peran dari folder radio-test:

```bash
./firmware.sh flash tx /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

TX harus menampilkan `ROLE=TX` dan `TX UART: PING ...`. Tutup monitor. TX dapat
tetap menyala dari laptop teman, charger, atau power bank. Flash board receiver
di laptop penerima, menyesuaikan port board tersebut:

```bash
./firmware.sh flash rx /dev/ttyUSB0
./firmware.sh monitor /dev/ttyUSB0
```

RX harus menampilkan `ROLE=RX` dan **`RX RADIO: PING ...`** sekitar setiap
2 detik. Nomor awal boleh lebih besar dari 1. Matikan TX: setelah sisa data
tiba, PING baru berhenti. Hidupkan lagi: PING kembali. Laptop tidak perlu
mengirim data satu sama lain; link antarmodul menggunakan radio.

`TX UART`, AUX HIGH, atau beberapa byte tanpa baris lengkap belum membuktikan
penerimaan PING. Penghitung byte/baris mulai ulang saat ESP32 restart.

## 4. Kembali ke sensor dan dashboard

Jika PING sudah berhasil dan kedua modul sudah `SETUP VERIFIED`, langsung
gunakan firmware sensor berikut. Profil E22 tetap tersimpan: **tidak perlu
setup ulang**, dan **M0=M1=GND** pada kedua modul untuk telemetri.

MPU6050 dan BMP280 hanya dipasang pada transmitter, berbagi SDA GPIO21 dan
SCL GPIO22. UART radio kedua board tetap RX GPIO16, TX GPIO17, AUX GPIO23.
Detail sensor tersedia di [README transmitter](../hardware/avionics/firmware/README.md).
Pin bertuliskan TX/RX tanpa nomor pada ESP32 klasik biasanya UART0 GPIO1/3;
gunakan GPIO16/17 untuk radio agar USB monitor dan dashboard tetap bekerja.

Tutup monitor dan koneksi Tauri sebelum flash. Dari root repository:

```bash
./hardware/telemetry.sh build
./hardware/telemetry.sh flash tx /dev/ttyUSB0
./hardware/telemetry.sh flash rx /dev/ttyACM0
./hardware/telemetry.sh monitor rx /dev/ttyACM0
```

Sesuaikan port dengan board masing-masing; gunakan `./hardware/telemetry.sh ports`
untuk melihat daftar port. Skrip ini memilih proyek **sensor**, terpisah dari
`hardware/radio-test/firmware`. Flash ESP32 tidak menghapus profil E22 maupun
profil kalibrasi sensor yang tersimpan oleh firmware.

Marker startup masing-masing firmware:

```text
# E22 SENSOR TELEMETRY ROLE=TX | MPU6050 + BMP280 | JSON sensor melalui radio
# E22 SENSOR TELEMETRY ROLE=RX | JSON sensor radio -> USB -> Tauri
```

Transmitter membaca IMU dengan target 100 Hz dan barometer 10 Hz, lalu mengirim
JSON sensor terbaru setiap **2 detik** jika AUX siap. Receiver mengumpulkan
stream sampai newline dan meneruskannya ke USB 115200; framing tidak bergantung
ukuran paket RF. Contoh keluaran receiver berikut ilustrasi:

```text
{"timestampMs":190047,"temperature":30.60,"pressure":998.64,"accelX":-0.474,"accelY":-0.022,"accelZ":9.182,"gyroX":-0.0557,"gyroY":0.0288,"gyroZ":-0.0168,"imuValid":true,"calibrated":false}
# E22 RX frame=1 bytes=189 AUX=1
```

`bytes` mengikuti panjang JSON yang diterima, tidak termasuk newline.
`temperature` adalah suhu internal MPU6050 (°C), `pressure` dari BMP280 (hPa),
percepatan dalam m/s², dan gyro dalam rad/s. Data bukan pembacaan RSSI atau
konfirmasi penerimaan dari log UART transmitter.

Sampel MPU tidak valid atau lebih tua dari 200 ms **tidak dikirim**; transmitter
mencetak `menunggu sampel MPU6050 valid`. Bila hanya BMP280 yang gagal, IMU
tetap dikirim dengan `pressure:null` dan log TX `baro=UNAVAILABLE`. Jika receiver
mencetak `menerima PING; flash firmware sensor`, transmitter masih memakai
firmware tes dan perlu di-flash dengan perintah `telemetry.sh flash tx` di atas.

Gerakkan sensor dan periksa angka di JSON receiver berubah. Matikan transmitter:
setelah sisa data selesai diterima, JSON baru berhenti. Nyalakan kembali untuk
memastikan penerimaan berlanjut. Ini memeriksa jalur sensor → radio → receiver.

Setelah JSON terbukti tiba, tutup monitor dengan Ctrl+C, jalankan `pnpm tauri dev`
dari `software`, pilih **port receiver**, lalu Start. Jangan jalankan monitor
bersamaan dengan Tauri pada port yang sama. Kalibrasi, profil/status IMU,
quaternion dan perintah jarak jauh belum diteruskan lewat radio pada tahap ini;
kalibrasi/3D tetap melalui USB langsung ke transmitter.

## Verifikasi software

Jalankan `./hardware/telemetry.sh test` dari root repository (`g++` dan Python 3).
Tes mencakup driver/kalibrasi, timing AUX, serialisasi pembacaan sensor sampai
parser receiver melalui fragmen UART, validitas field/satuan JSON untuk Tauri,
penolakan sampel non-finite, tekanan `null`, dan penolakan PING/frame rusak.
Tes konfigurasi terpisah tetap tersedia di `hardware/radio-test/firmware/test-host.sh`.
Build dan tes host tidak menggantikan tes sensor maupun radio fisik.
