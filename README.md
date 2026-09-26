# Tamuara

**Kisah kalian, dirayakan bersama.**

Web app undangan pernikahan dengan layanan mandiri dan bantuan admin. Tanpa `.env.local`, mode demo lokal berjalan tanpa akun eksternal. Adapter Supabase untuk akun, data undangan, dan media sudah terhubung ke proyek Tamuara untuk uji integrasi sementara.

## Jalankan

Prasyarat: Node.js 22 LTS dan npm. Dependency sudah dikunci dalam `package-lock.json`.

```powershell
npm.cmd ci
npm.cmd run dev
```

Buka alamat yang ditampilkan terminal, biasanya `http://127.0.0.1:3000`. Preview pada sesi pengembangan ini dijalankan di **http://127.0.0.1:3001**. Untuk menggunakan port tersebut secara eksplisit:

```powershell
node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3001
```

Tidak diperlukan kredensial eksternal untuk mode demo lokal. Pada `/masuk`, pilih **Demo pasangan** atau **Demo admin**, atau buat akun baru melalui `/daftar`. Jika `.env.local` berisi `TAMUARA_BACKEND=supabase`, aplikasi memakai akun Supabase dan tombol demo tidak tersedia.

## Yang dapat dicoba pada mode demo lokal

1. **Pasangan:** dashboard → buat undangan → isi pasangan/acara → simpan draf → pilih paket → simulasikan lunas → terbitkan.
2. **Tamu:** tambahkan penerima → bagikan tautan personal → buka dalam browser/sesi terpisah → isi RSVP dan ucapan.
3. **Moderasi:** lihat rekap RSVP → setujui ucapan agar tampil pada undangan.
4. **Bantuan admin:** aktifkan paket Dirangkai Bersama → isi brief → masuk Demo admin → mulai pekerjaan → edit → minta pemeriksaan → pemilik menyetujui dan menerbitkan.
5. **Tema:** pilih Classic Elegant, Floral Romantic, atau Minimal Modern. Mengubah tema/draf tidak langsung mengubah undangan terbit.

Halaman: `/`, `/tema`, `/harga`, `/faq`, `/kontak`, `/masuk`, `/daftar`, `/lupa-kata-sandi`, `/atur-kata-sandi`, `/app`, `/admin`, `/demo/classic`, `/demo/floral`, `/demo/minimal`, `/u/[slug]`, `/preview/[token]`.

Harga Rp249.000 dan Rp599.000 merupakan konfigurasi contoh pengembangan. **Pembayaran hanya simulasi; tidak ada dana yang ditagihkan.** Akun lokal belum memakai verifikasi/pemulihan email. Seluruh materi pada undangan demo adalah contoh.

## Konfigurasi dan data

Contoh variabel tersedia di `.env.example`. Salin menjadi `.env.local` jika diperlukan. Kredensial tidak ditulis ke kode atau dikirim melalui percakapan.

- `.data/tamuara.json`: akun lokal, undangan, tamu, sesi, RSVP, pesan, audit, dan transaksi simulasi.
- `.data/encryption.key`: kunci enkripsi token; diperlukan untuk membaca kembali tautan personal.
- `.data/media/`: foto yang diunggah, dioptimalkan menjadi WebP.
- `.data` dan file environment diabaikan Git dan dikecualikan dari tracing build.

Repository lokal mendukung satu proses Node.js dengan disk persisten. Penulisan data diantrikan dan menggunakan file pengganti atomik. Jangan menjalankan dua server yang menulis direktori data yang sama. Untuk backup lokal konsisten, hentikan server dan salin **seluruh** folder `.data` ke lokasi privat; pemulihan menggunakan salinan database, media, dan kunci yang sama. Uji pemulihan operasional sebelum memakai data pelanggan.

Proyek Supabase Tamuara terhubung ke repository GitHub dengan deploy production otomatis tetap nonaktif. Tujuh migrasi sudah diterapkan lokal dan online; katalog serta environment pembayaran online belum diaktifkan. Smoke test lokal/online meluluskan Auth, isolasi pasangan, media privat, pratinjau, klaim admin, publikasi/snapshot, tautan tamu, RSVP serentak, serta moderasi ucapan. Regresi provider online setelah migrasi pembayaran juga lulus. Akses publik memeriksa entitlement SQL dan pesanan lunas; kedaluwarsa menutup halaman serta media. Unduh Storage langsung ditutup dan penurunan peran admin mencabut akses privat. Semua fixture dibersihkan dan diverifikasi. Lihat [panduan Supabase](supabase/README.md).

Checkout sandbox dan pemeriksaan status sudah terhubung ke transaksi SQL; webhook tersedia di `/api/payments/midtrans/webhook`. Pembayaran tetap `disabled` secara default dan merespons 503 sampai mode `sandbox`, Server Key sandbox `SB-`, serta katalog SQL aktif tersedia. Harga dibekukan pada pesanan, riwayat pesanan dan sesi pembayaran hanya diterima pemilik, dan aktivasi/revokasi entitlement menyinkronkan SQL serta dokumen secara atomik. Pembayaran tidak menerbitkan undangan otomatis. Refund/review dapat mencabut paket bantuan yang bergantung pada pesanan dasar. Status diperiksa melalui tombol pelanggan; belum ada rekonsiliasi terjadwal. Sesi uncertain membutuhkan pemeriksaan operator dan belum mempunyai alat recovery. Production belum didukung oleh alur pembayaran ini. [Panduan sandbox](docs/PANDUAN-MIDTRANS-SANDBOX.md) dan [status integrasi](docs/INTEGRASI-PEMBAYARAN.md) menjelaskan prasyaratnya.

Proyek online dipakai sementara sebagai lingkungan uji. Site URL Auth dan callback sesuai `http://127.0.0.1:3001`; domain, SMTP, email nyata, dan merchant Midtrans masih diperlukan. Tes pembayaran lokal memakai provider tiruan terhadap SQL nyata; pesanan lunas pada smoke publik adalah fixture sintetis, bukan pembayaran merchant.

Adapter memakai satu dokumen JSONB per undangan dengan commit transaksional dan cek versi untuk menjaga isolasi dan mencegah data tertimpa. Tabel terstruktur sudah disiapkan untuk pengembangan berikutnya. RSVP bertrafik tinggi perlu dipindahkan ke transaksi khusus. Simpan kunci `TAMUARA_TOKEN_ENCRYPTION_KEY` bersama backup agar tautan tamu dan pratinjau tetap dapat dibaca.

`npm run start` menolak API data dalam production tanpa konfigurasi Supabase. Untuk memeriksa build **di mesin lokal**:

```powershell
npm.cmd run build
$env:TAMUARA_LOCAL_PREVIEW = 'true'
npm.cmd run start
```

Jangan memakai opsi preview lokal sebagai konfigurasi layanan pelanggan. Production akan memakai database transaksional dan provider terverifikasi.

## Verifikasi

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Untuk pengujian Supabase pada mesin lokal, jalankan `npx.cmd supabase start`, `npx.cmd supabase test db --local`, lalu `npm.cmd run test:supabase:local` di PowerShell. Tujuh migrasi telah lulus **175 pemeriksaan SQL** (90 pemeriksaan sebelumnya dan 85 pembayaran). Bukti smoke lokal/online tahap sebelumnya juga meliputi publikasi ulang, isolasi draf/snapshot, token/kuota tamu, RSVP serentak, moderasi, pencabutan paket, serta pembersihan data sintetis.

```powershell
npm.cmd run test:payments:local
```

Smoke pembayaran ini hanya menerima API `http://127.0.0.1:54321`. Provider Midtrans diganti respons sintetis; RPC checkout, deduplikasi, status, dan entitlement memakai SQL lokal nyata. Tes mengaktifkan sementara katalog lokal, lalu memulihkan seluruh baris katalog dan menghapus/verifikasi akun serta data sintetis. Tes tersebut sudah lulus, tetapi tidak membuktikan integrasi akun merchant.

Pengujian backend menggunakan direktori sementara dan klien provider tiruan untuk memeriksa isolasi, konflik versi, publikasi, token, RSVP, moderasi, media, entitlement SQL, adapter Midtrans, dan service pembayaran. **70 pemeriksaan TypeScript** (52 tes utama dan 18 subtes), typecheck, lint, dan build lulus. Pengujian browser memverifikasi **9 tes Chromium** untuk alur pasangan–tamu/admin, CSV, desktop/ponsel, serta pembayaran termasuk masa berlaku, revokasi, dan kredit peningkatan.

Playwright menjalankan server demo lokal terpisah pada port 3002 (dapat diubah dengan `TAMUARA_E2E_PORT`), memakai `.data/playwright` dan `.next-e2e`. Tes tidak memakai ulang server port 3001 yang mungkin sedang terhubung ke Supabase. Browser tests membuat akun sintetis pada data demo lokal; tidak mengirim email atau WhatsApp. Screenshot berada di `test-results/` dan tidak masuk Git. Safari/iOS fisik, email nyata, dan pembayaran pelanggan belum diuji end-to-end.

## Struktur

```text
src/app/(marketing)/        Website pemasaran
src/app/app/, admin/        Dashboard
src/app/api/                Auth, workspace, public, preview, media, webhook pembayaran
src/components/app/         Editor dan pengelolaan
src/components/invitation/  Renderer tiga tema
src/lib/server/             Domain lokal, adapter Supabase, validasi, token
src/lib/types.ts            Kontrak data bersama
src/lib/catalog.ts          Tema dan paket contoh
supabase/migrations/        Schema, RLS, dan commit transaksional
tests/                     Pengujian domain, HTTP, dan browser
docs/                      Rencana, backlog, dan status implementasi
```

## Acuan dan aset

- [Rencana pengembangan](docs/RENCANA-PENGEMBANGAN.md), [backlog](docs/BACKLOG-MVP.md), dan [status implementasi](docs/STATUS-IMPLEMENTASI.md).
- [Panduan konfigurasi email akun](docs/PANDUAN-EMAIL.md): domain pengirim, DNS, SMTP Supabase, callback, dan pengujian email nyata.
- [Panduan Midtrans Sandbox](docs/PANDUAN-MIDTRANS-SANDBOX.md): akun/kunci server, webhook HTTPS, katalog paket, simulator, dan matriks pengujian merchant.
- Logo pilihan pengguna: `brand/tamuara-logo.png`, disalin tanpa perubahan ke `public/brand/`.
- Foto contoh: [foto pernikahan 1](https://images.unsplash.com/photo-1519741497674-611481863552) dan [foto pernikahan 2](https://images.unsplash.com/photo-1511285560929-80b456fea0bc), Unsplash. Ganti dengan materi pasangan sebelum penggunaan nyata.
- Font Google Fonts mempunyai fallback lokal. Jaringan terputus tidak menghalangi pengisian atau pembacaan konten.
- Referensi teknis: [Next.js](https://nextjs.org/docs/app), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), dan [Midtrans webhook](https://docs.midtrans.com/docs/https-notification-webhooks).
