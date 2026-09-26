# Persiapan pembayaran Tamuara

Adapter provider berada di `src/lib/server/payments/midtrans.ts`. Adapter **belum dipanggil route aplikasi**, tidak mengaktifkan paket, dan belum diuji memakai merchant sandbox. Checkout Supabase tetap mengembalikan 503. Tidak ada transaksi dana nyata pada pengujian saat ini.

## Yang sudah disiapkan

- Sandbox menjadi default. Endpoint production hanya dipilih jika `MIDTRANS_IS_PRODUCTION=true`; kunci server tetap rahasia.
- `createTransaction(snapshot)` memakai ID pesanan, mata uang IDR, dan nominal integer dari snapshot server. Token/redirect Snap hanya membuka pembayaran, tidak membuktikan pelunasan.
- `getStatus(snapshot, transactionId?)` membaca status dengan autentikasi server. Transaction ID didukung untuk DANA/BI SNAP; hasil harus cocok dengan pesanan dan nominal tersimpan.
- `verifyNotification(body, snapshot, transactionId?)` memeriksa signature SHA512 secara konstan lalu mengambil status terbaru dari provider. Status dalam notifikasi bukan sumber pelunasan; transaction ID notifikasi hanya petunjuk pencarian.
- Capture kartu memerlukan persetujuan fraud. Status tidak dikenal, challenge, chargeback, atau refund parsial masuk `review`. Refund penuh dibedakan dari pembayaran gagal.
- Request memiliki timeout, batas respons, origin provider tetap, penolakan redirect, dan error tanpa payload/rahasia. Pembuatan transaksi tidak diulang otomatis.

Perilaku ini mengikuti dokumentasi resmi [Snap](https://docs.midtrans.com/docs/snap-snap-integration-guide), [autentikasi API](https://docs.midtrans.com/docs/api-authorization-headers), [notifikasi](https://docs.midtrans.com/docs/https-notification-webhooks), [status transaksi](https://docs.midtrans.com/reference/get-transaction-status), dan [siklus status](https://docs.midtrans.com/docs/transaction-status-cycle).

## Pekerjaan sebelum checkout diaktifkan

1. Buat merchant sandbox dan masukkan `MIDTRANS_SERVER_KEY` pada konfigurasi server privat. Harga dan ketentuan paket harus ditetapkan sebelum katalog SQL diaktifkan.
2. Buat pesanan server dengan snapshot harga/fitur dan ID unik. Pembuatannya harus idempoten; permintaan browser hanya memilih paket, bukan nominal.
3. Simpan sesi Snap serta provider transaction ID secara aman. Jika request pembuatan timeout, lakukan rekonsiliasi sebelum membuat transaksi lain.
4. Tambahkan webhook yang membatasi input, memverifikasi provider, menduplikasi event berdasarkan identitas tetap, dan melakukan perubahan pesanan/entitlement secara transaksional. Notifikasi terlambat tidak boleh menurunkan status lunas menjadi pending.
5. Aktivasi paket harus menyelaraskan entitlement SQL dengan dokumen undangan. Pencabutan/refund/kedaluwarsa memerlukan kebijakan bisnis yang jelas; akses publik sekarang memeriksa SQL pada setiap request dan menolak ketika authority paket tidak aktif.
6. Tambahkan rekonsiliasi untuk webhook yang hilang, antrean review/refund, audit tanpa data pembayaran sensitif, dan tampilan status pelanggan.
7. Uji sandbox: pending, sukses, challenge, gagal, cancel, expire, webhook berulang/terlambat, nominal berbeda, refund, dan gangguan jaringan. Pelunasan tidak menerbitkan undangan otomatis.

Tes unit adapter memakai respons provider tiruan. Smoke test Supabase memakai pesanan lunas **sintetis** untuk memeriksa izin publikasi, bukan checkout Midtrans. Mengisi kunci merchant saja belum membuka pembayaran di aplikasi.
