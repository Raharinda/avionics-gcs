# Pin firmware ESP32 terbaru

Acuan dasar pin adalah [gpioesp32.jpeg](gpioesp32.jpeg), dengan koreksi pengguna:
**AUX transmitter dan receiver sama-sama di D27/GPIO27**, aktif. Gambar ini menggantikan
penomoran GPIO lama pada [skematik keseluruhan](skematikAvionicGCSdanPop.jpeg),
yang tetap menjadi rujukan sambungan komponen. Definisi firmware bersama
berada di [board_pins.h](../hardware/shared/board_pins.h).

| Sinyal | GPIO ESP32 | Pemakaian firmware |
| --- | --- | --- |
| RX_LORA / RXD modul | 17 / TX2 | ESP32 mengirim ke LoRa |
| TX_LORA / TXD modul | 16 / RX2 | ESP32 menerima dari LoRa |
| M0_LORA | 25 | Output pemilihan mode |
| M1_LORA | 26 | Output pemilihan mode |
| AUX_LORA | **27 / D27 pada TX dan RX** | Input status modul, aktif |
| SDA MPU6050/BMP280 | 21 | I2C bersama |
| SCL MPU6050/BMP280 | 22 | I2C bersama |
| CALIBRATION | 13 | INPUT_PULLUP; aksi tombol belum diaktifkan |
| POP_TEST_IN | RX: 14; TX: dinonaktifkan | RX INPUT_PULLUP; GPIO14 TX tidak dikonfigurasi |
| POP_TEST_OUT | 19 | Avionics: pulsa HIGH 1–10000 ms lewat command GCS; boot/Reset LOW. GCS: tetap LOW |

Switch ke GND memakai logika aktif LOW. Tombol kalibrasi tidak menghapus
profil, memulai sesi, atau mengubah acuan. Kalibrasi enam posisi dan penetapan
acuan tetap melalui dashboard/command USB langsung ke transmitter.

Output GPIO19 LOW sejak setup. Avionics menerima pulsa melalui radio dengan
durasi yang dipilih pada panel COMMAND (default 200 ms), lalu timer ESP32
mengembalikan LOW. Reset GCS mengirim perintah LOW. Tombol fisik tetap pasif.
Rangkaian gate pull-down pada skematik tetap diperlukan selama ESP32
reset/belum menjalankan setup. Lihat [LoRa dua arah](lora-bidirectional.md).

M0/M1 otomatis LOW (NORMAL) saat boot. Dari terminal gunakan `LORA_PINS:0,0`,
`LORA_PINS:1,0`, `LORA_PINS:0,1`, atau `LORA_PINS:1,1` (urutan M0,M1).
Pada TX dan RX E32 tersedia `NORMAL|WAKEUP|POWER_SAVING|SLEEP`; alias `WOR` memilih POWER_SAVING
(0,1), sedangkan `CONFIG` memilih SLEEP (1,1). Gunakan `LORA_STATUS`
untuk status dan `LORA_HELP` untuk bantuan. Semua perintah bersifat lokal
pada ESP32 yang tersambung USB dan tetap melewati gate AUX.
Untuk perangkat tanpa AUX, tetapkan
ubah `E32_AUX_PIN` menjadi `-1` dalam `build_flags` di `platformio.ini`,
lalu build dan flash ulang. Pada TX, pertahankan
`-DBOARD_POP_TEST_INPUT_PIN=-1` agar GPIO14 tidak diatur sebagai tombol.
Mode tanpa AUX memakai guard waktu untuk profil radio 2,4 kbps.

MPU6050 dan BMP280 tetap berbagi I2C 100 kHz. Firmware mendeteksi MPU pada
0x68/0x69 dan BMP pada 0x76/0x77. Pada BMP280, CSB harus HIGH untuk I2C dan SDO
harus memiliki level penentu alamat; periksa apakah breakout sudah menyediakan
resistor tersebut. Firmware tidak dapat mengganti wiring pin CSB/SDO.

Sumbu posisi normal: **+X kanan, +Y depan, +Z atas**; arah negatifnya kiri,
belakang, dan bawah. Lihat [panduan kalibrasi](imu-orientation.md).
