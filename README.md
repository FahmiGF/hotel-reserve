# Hotel Reserve

Prototipe platform reservasi hotel yang berjalan end-to-end: aplikasi tamu, dashboard hotel mitra, panel admin, REST API, dan pembayaran sandbox.

Dibangun tanpa dependensi npm: backend memakai modul bawaan Node (`http`, `crypto`, `fs`), frontend berupa ES module vanilla tanpa build step. Data disimpan di satu file JSON dengan penulisan atomik.

## Menjalankan

Prasyarat: Node.js >= 22.5 (dites di Node 24).

```bash
cd hotel-reserve
npm start
```

Buka <http://127.0.0.1:3000>.

Saat pertama kali dijalankan, `data/db.json` dibuat otomatis dari data seed (10 hotel, 28 tipe kamar, 5 pengguna, promo, dan reservasi contoh). Hapus file tersebut untuk mengembalikan data ke kondisi awal.

| Variabel | Default | Keterangan |
| --- | --- | --- |
| `PORT` | `3000` | Port HTTP |
| `HOST` | `127.0.0.1` | Alamat bind |
| `DB_FILE` | `data/db.json` | Lokasi database JSON |
| `SESSION_SECRET` | acak per proses | Kunci tanda tangan token sesi |
| `PAYMENT_SERVER_KEY` | `sb-hotelreserve-demo-key` | Server key sandbox untuk verifikasi webhook |
| `TRAVELOKA_API_KEY`, `TRAVELOKA_PARTNER_ID`, `TRAVELOKA_BASE_URL` | kosong | Hanya untuk adaptor placeholder Traveloka |

## Akun demo

Semua akun memakai password `password123`.

| Email | Peran | Bisa apa |
| --- | --- | --- |
| `demo@hotelreserve.id` | Tamu (Silver) | Cari & pesan hotel, bayar, e-voucher, wishlist, ulasan, poin |
| `partner@hotelreserve.id` | Mitra (Budi) | Dashboard, kamar & tarif, kalender, konfirmasi/check-in reservasi |
| `staff@hotelreserve.id` | Staf hotel | Operasional reservasi hotel mitra |
| `admin@hotelreserve.id` | Admin (Sari) | Verifikasi hotel, transaksi, refund, promo, pengguna, moderasi ulasan |

Reservasi seed yang bisa dicoba: `HR-9F2K7Q` (selesai, bisa diulas), `HR-7QZ3ND` (menunggu konfirmasi mitra), dan satu reservasi terkonfirmasi Grand Meridian (bisa check-in oleh staf).

## Fitur

**Tamu**
- Pencarian dengan kota, tanggal, jumlah tamu, filter bintang/jenis properti/fasilitas/harga, dan pengurutan.
- Halaman hotel: galeri, fasilitas, tipe kamar dengan harga per malam dan total, ketersediaan real-time.
- Checkout transparan: subtotal, promo, tukar poin, biaya layanan 5%, PPN 11%, total akhir.
- Pembayaran sandbox: QRIS, virtual account BCA/Mandiri/BNI, e-wallet, kartu, transfer manual, dan bayar di hotel.
- Perjalanan saya, e-voucher dengan QR mock, pembatalan, ubah tanggal, dan ulasan (sekali per reservasi).
- Wishlist, notifikasi, serta membership Bronze/Silver/Gold/Platinum.

**Mitra**
- Ringkasan pendapatan bersih (setelah komisi 10%), okupansi, dan reservasi yang butuh perhatian.
- Properti, kamar & tarif (termasuk override harga per tanggal), kalender ketersediaan.
- Reservasi: terima/tolak, check-in, check-out, dan pembatalan.
- Ulasan tamu beserta balasan mitra.

**Admin**
- Verifikasi properti mitra (setujui/tolak).
- Transaksi lintas hotel, komisi platform, dan keputusan refund.
- Promo, status pengguna, serta moderasi ulasan.

## Invarian inventori

Hal yang paling mudah salah pada sistem reservasi adalah kamar terakhir terjual dua kali. Di sini:

1. `POST /api/v1/holds` mengunci kamar selama **15 menit** dan mengembalikan harga terbaru.
2. Ketersediaan dihitung dari kamar yang terpakai oleh booking aktif **ditambah** hold yang masih berlaku.
3. `POST /api/v1/bookings` mengubah hold menjadi booking dengan `ignoreHoldId` sehingga hold tersebut tidak dihitung dua kali.
4. `PATCH /api/v1/holds/:id` memperbarui promo/poin pada hold, agar total yang dibayar sama dengan total yang dikutip.
5. Hold dan pembayaran kedaluwarsa disapu secara berkala; inventori otomatis dilepas.

Uji konkurensi mengirim 8 permintaan bersamaan untuk satu kamar tersisa: tepat 1 berhasil dan 7 mendapat `409`.

## Status reservasi

```
pending_payment ──► confirmed ──► checked_in ──► completed
        │              │
        ├──► pending_confirmation ──► confirmed / rejected
        └──► cancelled / expired
```

`pending_confirmation` dipakai untuk bayar di hotel atau reservasi yang perlu persetujuan mitra. Refund mengembalikan inventori dan poin.

## Pembayaran sandbox

- `GET /api/v1/payments/:id` mengembalikan instruksi pembayaran (nomor VA, QR string, deeplink) sesuai metode.
- `POST /api/v1/payments/:id/simulate` menandai pembayaran lunas/gagal tanpa uang nyata.
- `POST /api/v1/payments/webhook` meniru webhook Midtrans: `signature_key = sha512(order_id + status_code + gross_amount + serverKey)`, memvalidasi nominal, dan idempoten terhadap notifikasi ganda.

## Endpoint utama

| Area | Endpoint |
| --- | --- |
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/profile` |
| Katalog | `GET /home`, `/destinations`, `/meta`, `/hotels`, `/hotels/:id`, `/promos` |
| Hold | `POST /holds`, `GET /holds/:id`, `PATCH /holds/:id`, `DELETE /holds/:id` |
| Booking | `POST /bookings`, `GET /bookings`, `GET /bookings/:id`, `POST /bookings/:id/pay`, `/cancel`, `/modify`, `/review`, `/refund` |
| Pembayaran | `GET /payments/:id`, `POST /payments/:id/simulate`, `POST /payments/webhook` |
| Akun | `GET /favorites`, `POST /favorites/:hotelId`, `GET /notifications`, `POST /notifications/read-all`, `GET /loyalty` |
| Mitra | `GET/POST /partner/hotels`, `PATCH /partner/hotels/:id`, `GET/POST /partner/hotels/:id/rooms`, `GET/PATCH/DELETE /partner/rooms/:id`, `GET /partner/calendar`, `/partner/bookings`, `/partner/reviews`, `/partner/stats`, `POST /partner/bookings/:id/:action` |
| Admin | `GET /admin/stats`, `/admin/hotels`, `/admin/users`, `/admin/transactions`, `/admin/bookings`, `/admin/refunds`, `/admin/promos`, `/admin/reviews` dan aksi terkait |
| Lain | `GET /health`, `GET /integrations/traveloka` |

Semua path API berawalan `/api/v1`. Respons error memakai bentuk `{ "error": { "message": "..." } }`. Endpoint yang butuh login memakai header `Authorization: Bearer <token>`.

## Struktur

```
hotel-reserve/
├── server.js              # entrypoint HTTP
├── src/
│   ├── app.js             # routing REST, static file, SPA fallback, sweep expiry
│   ├── seed.js            # data awal
│   ├── store.js           # JSON store atomik
│   ├── domain/            # tanggal, auth, harga, ketersediaan, booking, pembayaran, loyalty, pencarian
│   └── integrations/      # adaptor Traveloka (placeholder)
├── public/                # SPA: index.html, styles.css, js/
└── tests/                 # node --test
```

## Uji

```bash
cd hotel-reserve
npm test
```

Mencakup perhitungan harga, filter pencarian, siklus reservasi penuh, konkurensi kamar terakhir, pembatalan + refund, validasi signature webhook dan idempotensi, ulasan sekali pakai, penerimaan mitra, serta verifikasi admin.

## Batasan

- Pembayaran **simulasi**; tidak ada uang, kartu, atau akun gateway nyata.
- Tidak ada pengiriman email/PDF; e-voucher ditampilkan di aplikasi.
- Gambar properti berupa ilustrasi gradien dari data seed agar tetap jalan offline.
- Integrasi Traveloka hanya kerangka: tanpa kredensial ia melaporkan "belum dikonfigurasi" dan tidak pernah memalsukan data mitra.
- Penyimpanan JSON satu proses, cocok untuk demo dan pengembangan, bukan untuk deployment produksi multi-instance.
