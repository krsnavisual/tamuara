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

Proyek Supabase Tamuara terhubung ke repository GitHub, dengan deploy production otomatis tetap nonaktif. Enam migrasi sudah diterapkan. Smoke test lokal dan online dengan tiga akun sintetis meluluskan Auth, isolasi, media privat, pratinjau, klaim admin, publikasi/snapshot, tautan tamu, RSVP serentak, dan moderasi ucapan. Akses publik diperiksa terhadap entitlement SQL dan pesanan lunas; kedaluwarsa paket menutup halaman publik serta media. Media dibaca melalui endpoint aplikasi; unduh Storage langsung ditutup. Penurunan peran admin mencabut akses privatnya. Pesanan lunas pada tes hanya fixture sintetis; semua data uji dibersihkan dan diverifikasi. Proyek ini dipakai sementara sebagai lingkungan uji. Lihat [panduan Supabase](supabase/README.md) untuk menjalankan ulang tes. Site URL Auth dan callback sudah sesuai `http://127.0.0.1:3001`; SMTP serta email nyata masih diperlukan. Adapter Midtrans beserta tes sudah disiapkan, tetapi checkout dan webhook belum terhubung ke transaksi database. Mode Supabase tetap menolak checkout (503) dan simulasi pembayaran. Lihat [status integrasi pembayaran](docs/INTEGRASI-PEMBAYARAN.md).

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

Untuk pengujian provider Supabase pada mesin lokal, jalankan `npx.cmd supabase start`, `npx.cmd supabase test db --local`, lalu `npm.cmd run test:supabase:local` di PowerShell. Enam migrasi telah lulus **90 pemeriksaan SQL**. Smoke test lokal dan online juga memeriksa publikasi ulang, isolasi draf/snapshot, token dan kuota tamu, RSVP serentak, moderasi, pencabutan paket, serta pembersihan seluruh data sintetis.

Pengujian backend menggunakan direktori sementara dan klien provider tiruan untuk memeriksa isolasi, konflik versi, publikasi, token, RSVP, moderasi, media, entitlement SQL, dan adapter Midtrans. **57 pemeriksaan backend/HTTP** (39 tes utama dan 18 subtes) lulus. Pengujian browser mencakup alur pasangan–tamu/admin, CSV, serta desktop/ponsel; 5 tes Chromium lulus.

Playwright menjalankan server demo lokal terpisah pada port 3002 (dapat diubah dengan `TAMUARA_E2E_PORT`), memakai `.data/playwright` dan `.next-e2e`. Tes tidak memakai ulang server port 3001 yang mungkin sedang terhubung ke Supabase. Browser tests membuat akun sintetis pada data demo lokal; tidak mengirim email atau WhatsApp. Screenshot berada di `test-results/` dan tidak masuk Git. Safari/iOS fisik, email nyata, dan pembayaran pelanggan belum diuji end-to-end.

## Struktur

```text
src/app/(marketing)/        Website pemasaran
src/app/app/, admin/        Dashboard
src/app/api/                Auth, workspace, public, preview, media
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
- Logo pilihan pengguna: `brand/tamuara-logo.png`, disalin tanpa perubahan ke `public/brand/`.
- Foto contoh: [foto pernikahan 1](https://images.unsplash.com/photo-1519741497674-611481863552) dan [foto pernikahan 2](https://images.unsplash.com/photo-1511285560929-80b456fea0bc), Unsplash. Ganti dengan materi pasangan sebelum penggunaan nyata.
- Font Google Fonts mempunyai fallback lokal. Jaringan terputus tidak menghalangi pengisian atau pembacaan konten.
- Referensi teknis: [Next.js](https://nextjs.org/docs/app), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), dan [Midtrans webhook](https://docs.midtrans.com/docs/https-notification-webhooks).
