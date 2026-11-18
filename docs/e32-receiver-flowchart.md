# Flowchart Program E32 Receiver

Flowchart berikut merepresentasikan alur program `e32_receiver.cpp`.

```mermaid
flowchart TD
    A([Mulai]) --> B[Inisialisasi USB UART<br/>115200 baud]
    B --> C[Tunggu 500 ms]
    C --> D[Set GPIO23 sebagai INPUT AUX]
    D --> E[Inisialisasi LoRa UART2<br/>9600 baud, 8N1]
    E --> F[Tunggu 100 ms]
    F --> G{AUX HIGH?}
    G -->|Ya| H[Bridge siap]
    G -->|Tidak| I[Mulai timeout 3 detik]
    I --> J{Timeout tercapai?}
    J -->|Tidak| K[Tunggu 10 ms]
    K --> G
    J -->|Ya| L[Cetak peringatan<br/>AUX belum HIGH]
    L --> H

    H --> M[Cetak pesan bridge ready]
    M --> N[Loop utama]

    N --> O{LoRa UART memiliki data?}
    O -->|Tidak| P{USB UART memiliki data?}
    O -->|Ya| Q[Baca maksimal 256 byte atau data tersedia]
    Q --> R{Jumlah byte > 0?}
    R -->|Ya| S[Kirim byte ke USB]
    R -->|Tidak| P
    S --> P

    P -->|Tidak| N
    P -->|Ya| T[Baca maksimal 256 byte atau data tersedia]
    T --> U{Jumlah byte > 0?}
    U -->|Ya| V[Kirim byte ke LoRa UART]
    U -->|Tidak| N
    V --> N
```

## Ringkasan alur

- ESP32 menginisialisasi USB Serial pada baud rate `115200` dan UART LoRa pada baud rate `9600`.
- Pin `AUX` dibaca untuk memastikan modul E32 siap digunakan.
- Jika `AUX` tetap rendah selama 3 detik, program mencetak peringatan lalu tetap melanjutkan ke mode bridge.
- Pada loop utama, data LoRa diteruskan ke USB dan data USB diteruskan ke LoRa secara transparan, byte-per-byte.
