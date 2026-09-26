# Integrasi pembayaran Tamuara

## Status

Checkout sandbox, pemeriksaan status manual, dan webhook telah ditulis. Ketiganya memakai adapter Midtrans server serta RPC Supabase untuk transaksi pesanan. **Belum ada akun merchant atau transaksi simulator Midtrans yang diuji.** Pengujian memakai respons provider tiruan; SQL Supabase lokal benar-benar dijalankan.

Konfigurasi default `TAMUARA_PAYMENT_MODE=disabled`. Checkout dan webhook menolak permintaan sampai mode `sandbox`, Server Key sandbox berawalan `SB-`, backend Supabase, migrasi, dan katalog paket aktif tersedia. Alur aplikasi ini tidak menerima pembayaran production meskipun `MIDTRANS_IS_PRODUCTION=true`. Katalog pada migrasi tetap `active=false`; konfigurasi lingkungan online belum diaktifkan.

Ikuti [panduan Midtrans sandbox](PANDUAN-MIDTRANS-SANDBOX.md) untuk membuat akun sendiri, menyimpan rahasia, mengatur URL HTTPS, dan mencatat pengujian merchant. Refund dana tidak dijalankan oleh aplikasi ini.

## Alur server

1. Pemilik mengirim aksi `checkout` melalui `/api/workspace`: ID undangan, versi editor, pilihan paket, dan UUID idempotensi. Nominal browser diabaikan. Admin pendamping tidak dapat membeli atas nama pasangan.
2. `reserve_payment_checkout` mengunci dokumen/metadata undangan, memeriksa pemilik, versi, katalog, tanggal/zona waktu acara, dan pesanan terbuka. Harga dan fitur dibekukan di SQL. Satu reservasi memperoleh hak membuat sesi provider tepat sekali sebelum request jaringan dimulai.
3. Adapter membuat sesi Snap pada origin sandbox tetap. `save_payment_checkout_redirect` menyimpan URL hosted checkout dalam tabel privat. Token Snap tidak disimpan. URL dan pesanan hanya diberikan kepada pemilik oleh server; browser tidak dapat membaca tabel sesi secara langsung.
4. Pelanggan membuka halaman Snap di tab lain. Redirect atau tampilan sukses di browser tidak mengaktifkan paket.
5. Midtrans mengirim JSON ke `/api/payments/midtrans/webhook`. Handler membatasi body ke 32 KiB dan tidak memerlukan sesi browser. Adapter memverifikasi signature SHA512 lalu meminta status provider dengan autentikasi server, memeriksa order, transaction ID, mata uang IDR, dan nominal persis.
6. `apply_verified_payment_status` menduplikasi event dan mengubah order, entitlement SQL, dokumen JSONB, serta audit dalam satu transaksi. Konten, token tamu, RSVP, dan versi editor tidak diubah. Versi CAS dokumen dinaikkan sehingga edit bersamaan tidak menimpa perubahan keuangan. Paket lunas tidak menerbitkan undangan otomatis.
7. Aksi `refreshPayment` hanya tersedia bagi pemilik. Ia mengambil status provider dan memakai RPC yang sama. Saat ini rekonsiliasi dijalankan melalui tombol **Periksa status**; belum ada job berkala.

Capture kartu memerlukan fraud `accept`. Status tidak dikenal, challenge, chargeback, dan refund parsial masuk pemeriksaan. Adapter menggunakan timeout, batas respons, penolakan redirect transport, serta error yang tidak menyertakan payload/kunci provider. [Dokumentasi Snap](https://docs.midtrans.com/docs/snap-snap-integration-guide), [autentikasi API](https://docs.midtrans.com/docs/api-authorization-headers), [notifikasi](https://docs.midtrans.com/docs/https-notification-webhooks), [status transaksi](https://docs.midtrans.com/reference/get-transaction-status).

## Harga, masa berlaku, dan peningkatan

- Pembelian pertama berlaku sampai akhir hari acara terakhir ditambah satu tahun, dihitung memakai zona waktu acara. Tanggal harus valid dan masa berlaku belum berakhir.
- Paket Mandiri aktif dapat ditingkatkan ke bantuan admin. Biaya peningkatan adalah harga katalog bantuan saat checkout dikurangi nominal Mandiri yang benar-benar dibayar sebelumnya. Perubahan harga katalog Mandiri tidak mengubah potongan pesanan lama. Masa berlaku tetap mengikuti paket pertama; fitur bantuan dibekukan pada order peningkatan.
- Perpanjangan paket yang pernah dibeli, pembelian ulang setelah refund, serta penyelesaian review belum tersedia. Pesanan belum selesai atau perlu pemeriksaan menghalangi checkout baru.

## Status dan pencabutan akses

- Notifikasi berulang tidak mengaktifkan atau memperpanjang paket berulang.
- Pending terlambat tidak menurunkan order lunas. Status negatif terverifikasi setelah lunas menjadi `review` dan menutup entitlement terkait.
- Order gagal, dibatalkan, atau kedaluwarsa tidak kembali pending; sukses yang tiba setelah status terminal tersebut masuk review tanpa mengaktifkan paket. Ini melindungi urutan hasil lookup yang tumpang tindih.
- Refund penuh mencabut entitlement terkait. Review/refund tidak dapat dipulihkan otomatis oleh sukses lama.
- Order peningkatan menyimpan `baseOrderId`. Refund atau reversal paket dasar mencabut entitlement peningkatan yang bergantung padanya dan membuat order peningkatan perlu pemeriksaan.
- Pemeriksaan SQL pada publikasi, halaman/RSVP/ucapan, dan media publik menutup akses ketika entitlement dicabut atau kedaluwarsa. [Siklus status dan reversal Midtrans](https://docs.midtrans.com/docs/transaction-status-cycle).

## Batas pemulihan dan gerbang berikutnya

GET Status `404` sebelum pelanggan memilih metode pembayaran adalah kondisi Snap yang normal. Ia tidak membuktikan sesi boleh dibuat ulang. Reservasi tanpa redirect tersimpan dilaporkan **uncertain**; request pembuatan tidak diulang otomatis setelah timeout, respons hilang, atau proses crash. Saat ini operator harus memeriksa order ID pada dashboard merchant dan menangani kasus melalui dukungan/manual. Belum tersedia alat aman untuk penerbitan ulang sesi, penyelesaian review, atau pemulihan checkout. Tidak ada endpoint yang menghapus reservasi untuk memaksa transaksi baru.

Sebelum pilot berbayar masih diperlukan:

1. Merchant sandbox sendiri dan URL webhook HTTPS publik; jalankan matriks simulator, termasuk refund/reversal jika metode mendukungnya. Catat skenario yang tidak tersedia.
2. Harga, fitur, masa berlaku, pembatalan/refund, serta prosedur dukungan yang disepakati.
3. Pemulihan sesi uncertain, antrean/operator review, rekonsiliasi berkala, monitoring dan alert yang tidak memuat token/data pembayaran sensitif.
4. Kebijakan penanganan refund/chargeback, perpanjangan, dan penyelesaian order terlambat sebelum menambah jalur activation live.
5. Hosting/domain, SMTP, pemisahan staging/production, backup dan pemulihan, lalu pengujian production terpisah. Deploy production otomatis tetap nonaktif.

## Verifikasi yang dapat diulang

```powershell
npm.cmd test
npx.cmd supabase test db --local
npm.cmd run test:payments:local
npm.cmd run test:e2e
```

Smoke pembayaran menolak URL selain `http://127.0.0.1:54321`, memakai provider sintetis melalui dependency injection, mengaktifkan katalog lokal sementara, lalu memulihkan semua baris katalog asli dan memverifikasi pembersihan akun/undangan/order/sesi/event. Ia menguji harga SQL, checkout bersamaan, penyimpanan redirect, isolasi pemilik, pembayaran idempoten, penolakan signature/nominal, refund/review, dan larangan publikasi otomatis. Hasil ini belum membuktikan transaksi merchant Midtrans nyata.
