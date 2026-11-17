# GCS E32-433T30D Receiver

Firmware bridge E32-433T30D untuk ESP32 dalam mode UART transparan. Bridge ini
meneruskan telemetry dari avionics ke dashboard melalui USB dan meneruskan
command dari dashboard kembali ke avionics melalui LoRa.

| E32-433T30D | ESP32 |
| --- | --- |
| M0 | GND |
| M1 | GND |
| RX | GPIO 17 / TX2 |
| TX | GPIO 16 / RX2 |
| AUX | GPIO 23 |
| GND | GND |
| VCC | 3V3 |

UART E32 menggunakan 9600 baud, sedangkan USB Serial menggunakan 115200 baud.
Di Windows, gunakan skrip berikut dari PowerShell:

```powershell
.\firmware.ps1 build
.\firmware.ps1 flash
.\firmware.ps1 monitor
```

Jika PowerShell menolak eksekusi skrip untuk sesi tersebut, jalankan:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
```

Port dapat diberikan sebagai argumen kedua:

```powershell
.\firmware.ps1 flash COM5
.\firmware.ps1 monitor COM5
```

Skrip memakai PlatformIO lokal di
`$HOME\.platformio\penv\Scripts\pio.exe`, jadi perintah `pio` tidak perlu
ditambahkan ke PATH.

Pasang antena 433 MHz dan pastikan catu daya 3,3 V mampu menangani arus
E32-433T30D.
