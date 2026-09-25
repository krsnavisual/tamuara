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

Proyek Supabase Tamuara terhubung ke repository GitHub, dengan deploy production otomatis tetap nonaktif. Tiga migrasi sudah diterapkan ke proyek tersebut. Smoke test online dengan dua akun sintetis telah meluluskan login, profil otomatis, draf, audit, dan isolasi pasangan; semua data uji dihapus dan jumlahnya diverifikasi kembali. Proyek ini dipakai sementara sebagai lingkungan uji. Lihat [panduan Supabase](supabase/README.md) untuk menjalankan ulang tes. Konfirmasi dan pemulihan email masih memerlukan pengaturan Auth serta layanan email. Akun merchant belum tersedia; checkout Midtrans dan webhook belum terhubung. Mode Supabase menonaktifkan pembayaran simulasi dan tidak dapat menerbitkan undangan tanpa entitlement.

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

Untuk pengujian provider Supabase pada mesin lokal, jalankan `npx.cmd supabase start`, `npx.cmd supabase test db --local`, lalu `npm.cmd run test:supabase:local` di PowerShell. Pengujian terakhir berhasil dengan **49 pemeriksaan SQL**. Smoke test online menguji Auth, draf, audit, dan isolasi dua pasangan dengan pembersihan data sintetis.

Pengujian backend menggunakan direktori sementara dan klien Supabase tiruan untuk memeriksa isolasi pelanggan, pembayaran simulasi, konflik versi, publikasi, token, kuota RSVP, moderasi, akses media, serta pemeriksaan asal request. Pengujian browser menjalankan alur pasangan–tamu dan admin, impor CSV, serta layout desktop/ponsel di Chromium. Hasil terakhir: **22 tes backend/HTTP dan 5 tes browser lulus**.

Playwright memakai port 3001 dan dapat memakai ulang server yang sudah aktif. Jika belum ada, konfigurasi tes menjalankannya. Browser tests membuat akun sintetis pada data lokal; tidak mengirim email atau pesan WhatsApp. Screenshot berada di `test-results/` dan tidak masuk Git. Tiga migrasi dan 49 pemeriksaan pgTAP telah lulus pada Supabase lokal. Alur dasar telah lulus pada proyek Supabase online; Safari/iOS fisik, email nyata, media privat, penugasan admin, publikasi, dan pembayaran belum diuji end-to-end di sana.

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
- Logo pilihan pengguna: `brand/tamuara-logo.png`, disalin tanpa perubahan ke `public/brand/`.
- Foto contoh: [foto pernikahan 1](https://images.unsplash.com/photo-1519741497674-611481863552) dan [foto pernikahan 2](https://images.unsplash.com/photo-1511285560929-80b456fea0bc), Unsplash. Ganti dengan materi pasangan sebelum penggunaan nyata.
- Font Google Fonts mempunyai fallback lokal. Jaringan terputus tidak menghalangi pengisian atau pembacaan konten.
- Referensi teknis: [Next.js](https://nextjs.org/docs/app), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), dan [Midtrans webhook](https://docs.midtrans.com/docs/https-notification-webhooks).
