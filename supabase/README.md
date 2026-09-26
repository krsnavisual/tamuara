# Konfigurasi database Tamuara

## Status implementasi

Aplikasi pada port 3001 saat ini memilih `TAMUARA_BACKEND=supabase` di `.env.local` dan memakai proyek uji sementara. Jika backend Supabase tidak dipilih saat pengembangan, mode lokal menyimpan akun, undangan, sesi, RSVP, bantuan admin, dan transaksi simulasi di `.data/tamuara.json`; gambar berada di `.data/media`. Salinan token terenkripsi memakai `.data/encryption.key`. Simpan database, media, dan kunci bersama saat membuat backup lokal. Jangan commit atau membagikan folder `.data`.

Migrasi dan adapter Supabase untuk Auth, undangan, publik, media, dan klaim bantuan admin telah ditulis. Enam migrasi sudah diterapkan ke proyek Tamuara `fegugfhyahwdcfydapuf`. Smoke test lokal dan online untuk Auth, draf/audit, isolasi pasangan, media privat/WebP melalui aplikasi, rotasi token pratinjau, antrean/klaim admin dengan entitlement paket bantuan, serta pencabutan akses setelah peran admin diturunkan telah lulus. Alur review/publikasi, snapshot terbit ulang, RSVP bersamaan, moderasi ucapan, token tamu, dan penutupan akses saat entitlement SQL kedaluwarsa juga lulus pada kedua lingkungan. Unduh langsung dari Storage ditolak. Data sintetis termasuk publikasi, keanggotaan, pesanan/entitlement, metadata media, objek Storage, dan akun Auth sudah dibersihkan dan diverifikasi. Proyek ini dipakai sementara sebagai lingkungan uji; deploy production otomatis tetap nonaktif. Akun merchant belum tersedia. Modul verifikasi Midtrans dan 12 tes unit sudah disiapkan, tetapi endpoint checkout/webhook belum dibuat dan tidak ada transaksi merchant nyata. Mode Supabase menolak checkout dengan 503 dan tidak menyediakan pembayaran simulasi. Pesanan berstatus lunas dalam smoke test hanya fixture sintetis yang dibuat langsung untuk menguji otorisasi, bukan pembayaran nyata.

## Menjalankan aplikasi lokal

- `npm.cmd run dev` mengaktifkan mode demo jika `.env.local` tidak memilih backend Supabase.
- `TAMUARA_DATA_DIR` opsional menentukan lokasi data. Jika tidak diisi, gunakan `.data` di root proyek.
- Login demo pemilik/admin menggunakan akun contoh. Akun baru dapat didaftarkan; kata sandi disimpan sebagai hash scrypt. Akun ini belum memverifikasi email dan tidak menyediakan pemulihan kata sandi melalui email.
- Pembayaran adalah simulasi yang diberi label demo. Dana tidak dipindahkan dan paket aktif hanya di repository lokal.
- Repository hanya mendukung **satu proses Node.js dengan disk persisten**. Antrean dalam proses mencegah saling menimpa, tetapi bukan lock antar proses dan tidak sesuai untuk beberapa instance/serverless.
- `npm run start` dalam mode produksi menolak layanan data (503) secara default. `TAMUARA_LOCAL_PREVIEW=true` adalah opt-in khusus untuk menguji hasil build lokal. Jangan gunakan opsi itu sebagai konfigurasi peluncuran pelanggan.

## Menjalankan Supabase lokal

`config.toml` memakai Site URL `http://127.0.0.1:3001`, mengizinkan tepat dua callback (`/api/auth/callback` dan `/api/auth/callback?flow=recovery`), serta mengaktifkan konfirmasi email. Site URL dan allowlist callback ini sudah disinkronkan ke proyek online dengan `supabase config push`. SMTP proyek masih memakai layanan default Supabase yang terbatas; domain/SMTP pelanggan belum tersedia dan alur email nyata belum diverifikasi. Ikuti [panduan konfigurasi email](../docs/PANDUAN-EMAIL.md) setelah layanan tersedia. Stack lokal tidak memerlukan akun Supabase online. Instal dependensi proyek, jalankan Docker Desktop, lalu dari root proyek jalankan:

```powershell
npx.cmd supabase start
npx.cmd supabase test db --local
npm.cmd run test:supabase:local
```

`npx.cmd supabase start` menerapkan migrasi pada database lokal saat pertama kali dijalankan. Tiga berkas pgTAP untuk enam migrasi telah lulus dengan 90 pemeriksaan. `test:supabase:local` menguji Auth, profil, draf, audit, isolasi pasangan, media privat, pratinjau, antrean/klaim bantuan admin, pencabutan akses admin, serta alur publikasi/tamu melalui route aplikasi, lalu membersihkan data sintetisnya; perintah ini menolak URL API selain `http://127.0.0.1:54321`. Jika perlu mengulang migrasi dari awal, `npx.cmd supabase db reset --local` **menghapus data di database Supabase lokal**. Jangan gunakan perintah reset pada proyek online. Alamat API, kunci publik, kunci rahasia, dan Mailpit lokal tersedia melalui `npx.cmd supabase status`. Salin hanya nilai yang diperlukan ke `.env.local`; kunci rahasia tidak boleh diberi awalan `NEXT_PUBLIC_`.

## Smoke test proyek online sementara

Setelah migrasi diterapkan ke proyek Tamuara `fegugfhyahwdcfydapuf`, isi `.env.local` dengan URL proyek, publishable key, secret key, dan kunci enkripsi sesuai `.env.example`. Untuk menjalankan uji yang membuat tiga akun sintetis, satu draf, satu objek Storage, serta pesanan/entitlement bantuan sementara:

```powershell
$env:TAMUARA_REMOTE_SMOKE_PROJECT_REF = "fegugfhyahwdcfydapuf"
npm.cmd run test:supabase:remote
Remove-Item Env:TAMUARA_REMOTE_SMOKE_PROJECT_REF
```

Skrip hanya menerima URL HTTPS proyek tersebut, memerlukan opt-in project ref yang persis, dan tidak mencetak kunci. Uji meliputi login, profil otomatis, draf/audit, isolasi pasangan kedua, media privat/WebP, rotasi pratinjau, antrean yang hanya terlihat oleh admin, penolakan klaim versi lama, klaim admin yang sah, perubahan status layanan, akses media melalui aplikasi untuk admin yang ditugaskan, penolakan unduh Storage langsung, serta pencabutan akses aplikasi/database/media setelah peran admin diturunkan.

Alur bersama di `scripts/supabase-public-smoke.ts` juga memeriksa review admin, publikasi hanya oleh pemilik, penolakan versi lama, jumlah snapshot SQL satu saat terbit pertama dan dua setelah terbit ulang, respons publik `no-store` tanpa data privat, serta detail hadiah yang diizinkan. Tamu diuji untuk hak acara/kuota, penolakan token undangan lain, RSVP bersamaan dengan CAS/upsert yang mempertahankan versi editor, ucapan tertunda/duplikat/moderasi, dan rotasi/penghapusan token. Perubahan draf tidak mengubah snapshot terbit. Penarikan publikasi/arsip menutup akses publik/media; entitlement SQL kedaluwarsa menutup GET/POST publik, media publik, dan menolak publikasi dengan 402.

Pesanan berstatus lunas dibuat langsung oleh fixture tes untuk memeriksa gerbang entitlement; tidak melewati checkout. Setelahnya skrip menghapus objek Storage lebih dulu, lalu pesanan/entitlement, data undangan, dan akun Auth; skrip juga memverifikasi publikasi, keanggotaan, dan seluruh data sintetis hilang. Jika pembersihan gagal, perintah keluar dengan kode gagal dan mencetak ID/email sintetis untuk pemeriksaan manual. Skrip lokal tetap hanya menerima alamat loopback; menjalankan salah satu skrip tidak mengaktifkan deploy production.

Migrasi tambahan `202609250002_harden_access.sql` memperketat hak baca token dan metadata pembayaran serta mengunci kepemilikan pesanan ke undangan. `202609250003_invitation_documents.sql` menyediakan penyimpanan dokumen undangan penuh sebagai jembatan dari model domain yang sudah berjalan. `invitation_documents.state` berisi data privat sehingga hanya server dengan service role yang diberi akses. `preview_token_hash` adalah kolom generated dengan indeks unik untuk pencarian tautan pratinjau tanpa membuka isi dokumen.

`202609260001_assistance_claim.sql` menambahkan antrean permintaan bantuan dan klaim transaksional untuk admin terautentikasi. Antrean hanya berisi ID undangan, versi dokumen, dan waktu perubahan; brief tetap privat sampai admin berhasil mengklaim. RPC memeriksa paket bantuan berbayar yang masih aktif, versi dokumen, dan penugasan dalam satu transaksi. Klaim tidak mengubah versi editor `state.version`.

`202609260002_assistance_role_access.sql` mensyaratkan peran profil `admin` yang masih aktif untuk hak `assigned_admin` pada undangan; keanggotaan `editor` tetap berlaku sesuai izinnya. `202609260003_private_media_proxy_only.sql` menutup unduh langsung dari Storage bagi pengguna terautentikasi. Semua media undangan dilayani melalui `/api/media/[id]`, yang memeriksa izin terkini pada setiap request dan mengirim respons privat tanpa cache.

Adapter server memanggil `public.commit_invitation_document(p_invitation_id uuid, p_expected_version integer, p_state jsonb, p_actor_id uuid, p_action text)` dan menerima versi dokumen baru sebagai integer. Versi `0` membuat undangan draf secara atomik. Versi berikutnya harus sama dengan `invitation_documents.version`, sehingga dua penulis tidak saling menimpa. RPC menyinkronkan slug, status, masa berlaku, admin yang ditugaskan, membuat snapshot saat terbit/terbit ulang, dan mencatat audit perubahan rekening tanpa nilai rekening. `state.version` tetap versi editor, sedangkan `invitation_documents.version` naik pada **setiap** perubahan termasuk RSVP. RPC ini hanya dapat dipanggil service role dan tetap memerlukan otorisasi pengguna di API aplikasi sebelum dipanggil.

Adapter memeriksa hak paket dokumen terhadap `entitlements` dan pesanan SQL lunas sebelum melayani publikasi, RSVP/ucapan, atau media publik. ID entitlement, undangan, pemilik, paket, dan pesanan harus cocok; masa berlaku dokumen dan SQL harus masih aktif. Pemeriksaan diulang saat retry CAS agar hak yang kedaluwarsa tidak dipakai kembali. Snapshot entitlement dalam JSONB tidak dapat mengaktifkan layanan sendiri. Mode lokal tetap memakai hak paket simulasi di repository lokal.

Uji pgTAP di `tests/database` memeriksa isolasi dua pasangan, hak baca admin yang ditugaskan, pencabutan hak setelah penurunan peran, penolakan unduh Storage langsung, larangan baca token dari browser, FK lintas undangan, CAS, snapshot publikasi, serta gerbang entitlement dan klaim bantuan admin. Jalankan dengan `npx.cmd supabase test db --local` setelah stack hidup di PowerShell.

## Schema yang disiapkan

Semua data undangan mengacu ke `invitation_id`. Foreign key gabungan mencegah penerima, acara, RSVP, pesanan, dan pembayaran dari undangan berbeda digabungkan. RSVP mempunyai satu baris per penerima/acara dan trigger pembatas kuota. Konten draf dan publikasi disimpan terpisah. Pesanan menyimpan snapshot paket serta masa aktif. Dokumen JSONB adalah tahap peralihan untuk adapter aplikasi; tabel terstruktur tetap disiapkan untuk transaksi pesanan, tamu, RSVP, dan pelaporan saat adapter produksi berkembang.

RLS aktif untuk setiap tabel aplikasi. Pengguna terautentikasi hanya membaca undangannya atau undangan yang ditugaskan; data profil hanya dapat dibaca sendiri. Kolom token, dokumen JSONB lengkap, event pembayaran, dan audit hanya dapat dibaca server. Browser tidak diberi hak tulis tabel. Semua perubahan melalui API server yang memvalidasi sesi, keanggotaan, versi draf, dan izin tindakan. Peran admin ditetapkan oleh operator tepercaya, bukan metadata saat signup. Paket katalog awal berstatus `active=false` sampai harga dan ketentuan layanan ditetapkan.

Bucket `tamuara-private` tidak publik. Path media wajib diawali UUID undangan. Klien tidak dapat mengunduh objek Storage secara langsung; semua pembacaan melalui endpoint server `/api/media/[id]` yang memeriksa akses pemilik, admin yang masih berwenang, token pratinjau, atau publikasi pada setiap request. Respons privat memakai `no-store` agar perubahan izin segera berlaku. Anon tidak mempunyai akses langsung ke tabel undangan, RSVP, rekening, tamu, atau transaksi.

## Langkah aktivasi setelah akun layanan tersedia

1. Sebelum melayani pelanggan, pisahkan proyek staging dan production jika kapasitas akun memungkinkan. Ulangi pengujian RLS dan klaim bantuan setelah konfigurasi domain/email produksi.
2. Konfigurasi URL proyek, publishable key untuk klien Auth, serta secret key hanya di server. Nama kunci legacy `anon` dan `service_role` masih diterima sebagai fallback. Pilih sistem kunci token tetap untuk enkripsi AES-256-GCM, simpan sebagai rahasia server, dan dokumentasikan pemulihannya.
3. Isi `.env.local` dari `.env.example`, set `TAMUARA_BACKEND=supabase`, dan buat kunci token stabil 32 byte: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Simpan kunci ini di secret manager dan backup aman. Jangan memakai kunci service role di browser.
4. Site URL Auth dan kedua redirect callback sudah diterapkan untuk alamat pengembangan. Sebelum melayani pelanggan, atur domain produksi, SMTP dan template email, lalu uji daftar, konfirmasi, login, keluar, dan pemulihan kata sandi dengan akun nyata.
5. Alur dua pasangan, media privat, rotasi pratinjau, klaim admin, review/publikasi, konflik RSVP, snapshot terbit, serta kedaluwarsa hak paket sintetis sudah diuji pada provider nyata. Lanjutkan pilot dan uji beban sesuai kebutuhan volume.
6. Hubungkan endpoint checkout sandbox dan webhook Midtrans dengan modul server yang sudah disiapkan mengikuti [rencana integrasi pembayaran](../docs/INTEGRASI-PEMBAYARAN.md). Nominal berasal dari snapshot pesanan server. Modul menguji signature notifikasi dan pencocokan status provider terautentikasi, ID, serta nominal; integrasi transaksi, deduplikasi, dan rekonsiliasi masih diperlukan. Redirect browser tidak mengaktifkan paket. Pembayaran tidak menerbitkan undangan otomatis.
7. Uji restore database **dan** media pada staging. Setelah lulus, aktifkan merchant live, domain, logging tanpa token/PII, dan konfigurasi produksi.

## Environment yang akan digunakan adapter produksi

| Variabel | Kegunaan | Status |
| --- | --- | --- |
| `TAMUARA_BACKEND` | `local` atau `supabase` | Wajib `supabase` untuk adapter baru |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek | Dipakai Auth/server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Kunci publishable proyek | Dipakai Auth; lebih diutamakan dari kunci anon legacy |
| `SUPABASE_SECRET_KEY` | Kunci server untuk operasi terkontrol | Dipakai server; rahasia, lebih diutamakan dari service role legacy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci anon legacy | Fallback saat publishable key kosong |
| `SUPABASE_SERVICE_ROLE_KEY` | Kunci service role legacy | Fallback saat secret key kosong; rahasia |
| `TAMUARA_TOKEN_ENCRYPTION_KEY` | Kunci enkripsi token produksi | Dipakai server; 64 karakter heksadesimal |
| `MIDTRANS_SERVER_KEY` | Akses API dan verifikasi pembayaran | Modul server disiapkan; belum ada merchant/endpoint aktif; rahasia server |
| `MIDTRANS_IS_PRODUCTION` | Pemilihan sandbox/live | Modul server disiapkan; mulai dari `false` |

Dokumentasi acuan: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Midtrans webhooks](https://docs.midtrans.com/docs/https-notification-webhooks). Migrasi dan alur dasar sudah diuji pada instance Supabase; fitur pelanggan lainnya masih memerlukan pengujian sebelum siap produksi.
