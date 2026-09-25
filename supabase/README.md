# Konfigurasi database Tamuara

## Status implementasi

Aplikasi memakai repository lokal secara default saat pengembangan. Akun, undangan, sesi, RSVP, bantuan admin, dan transaksi simulasi disimpan di `.data/tamuara.json`; gambar berada di `.data/media`. Salinan token terenkripsi memakai `.data/encryption.key`. Simpan database, media, dan kunci bersama saat membuat backup lokal. Jangan commit atau membagikan folder `.data`.

Migrasi dan adapter Supabase untuk Auth, undangan, publik, dan media telah ditulis. Tiga migrasi sudah diterapkan ke proyek Tamuara `fegugfhyahwdcfydapuf`, dan smoke test online untuk Auth, draf, audit, serta isolasi dua pasangan telah lulus. Akun dan undangan sintetis sudah dibersihkan. Proyek ini dipakai sementara sebagai lingkungan uji; deploy production otomatis tetap nonaktif. Aktifkan adapter dengan `TAMUARA_BACKEND=supabase` dan kredensial server yang sesuai. Akun merchant belum tersedia; checkout Midtrans dan webhook belum dibuat. Mode Supabase menolak checkout dan pembayaran simulasi.

## Menjalankan aplikasi lokal

- `npm.cmd run dev` mengaktifkan mode demo jika `.env.local` tidak memilih backend Supabase.
- `TAMUARA_DATA_DIR` opsional menentukan lokasi data. Jika tidak diisi, gunakan `.data` di root proyek.
- Login demo pemilik/admin menggunakan akun contoh. Akun baru dapat didaftarkan; kata sandi disimpan sebagai hash scrypt. Akun ini belum memverifikasi email dan tidak menyediakan pemulihan kata sandi melalui email.
- Pembayaran adalah simulasi yang diberi label demo. Dana tidak dipindahkan dan paket aktif hanya di repository lokal.
- Repository hanya mendukung **satu proses Node.js dengan disk persisten**. Antrean dalam proses mencegah saling menimpa, tetapi bukan lock antar proses dan tidak sesuai untuk beberapa instance/serverless.
- `npm run start` dalam mode produksi menolak layanan data (503) secara default. `TAMUARA_LOCAL_PREVIEW=true` adalah opt-in khusus untuk menguji hasil build lokal. Jangan gunakan opsi itu sebagai konfigurasi peluncuran pelanggan.

## Menjalankan Supabase lokal

`config.toml` mengarahkan callback Auth ke `http://127.0.0.1:3001` dan mengaktifkan konfirmasi email. Konfigurasi ini tidak memerlukan akun Supabase online. Instal dependensi proyek, jalankan Docker Desktop, lalu dari root proyek jalankan:

```powershell
npx.cmd supabase start
npx.cmd supabase test db --local
npm.cmd run test:supabase:local
```

`npx.cmd supabase start` menerapkan tiga migrasi pada database lokal saat pertama kali dijalankan. Dua berkas pgTAP telah lulus dengan 49 pemeriksaan. `test:supabase:local` menguji Auth, profil, draf, audit, dan isolasi dua pasangan melalui route aplikasi, lalu membersihkan data sintetisnya; perintah ini menolak URL API selain `http://127.0.0.1:54321`. Jika perlu mengulang migrasi dari awal, `npx.cmd supabase db reset --local` **menghapus data di database Supabase lokal**. Jangan gunakan perintah reset pada proyek online. Alamat API, kunci publik, kunci rahasia, dan Mailpit lokal tersedia melalui `npx.cmd supabase status`. Salin hanya nilai yang diperlukan ke `.env.local`; kunci rahasia tidak boleh diberi awalan `NEXT_PUBLIC_`.

## Smoke test proyek online sementara

Setelah migrasi diterapkan ke proyek Tamuara `fegugfhyahwdcfydapuf`, isi `.env.local` dengan URL proyek, publishable key, secret key, dan kunci enkripsi sesuai `.env.example`. Untuk menjalankan uji yang membuat dua akun sintetis dan satu draf sementara:

```powershell
$env:TAMUARA_REMOTE_SMOKE_PROJECT_REF = "fegugfhyahwdcfydapuf"
npm.cmd run test:supabase:remote
Remove-Item Env:TAMUARA_REMOTE_SMOKE_PROJECT_REF
```

Skrip hanya menerima URL HTTPS proyek tersebut, memerlukan opt-in project ref yang persis, dan tidak mencetak kunci. Uji meliputi login, profil otomatis, penyimpanan draf dan audit, serta isolasi pasangan kedua. Setelahnya skrip menghapus data buatannya lalu memverifikasi akun Auth, profil, draf, dokumen, dan audit sudah hilang. Jika pembersihan gagal, perintah keluar dengan kode gagal dan mencetak ID/email sintetis untuk pemeriksaan manual. Skrip lokal tetap hanya menerima alamat loopback; menjalankan salah satu skrip tidak mengaktifkan deploy production.

Migrasi tambahan `202609250002_harden_access.sql` memperketat hak baca token dan metadata pembayaran serta mengunci kepemilikan pesanan ke undangan. `202609250003_invitation_documents.sql` menyediakan penyimpanan dokumen undangan penuh sebagai jembatan dari model domain yang sudah berjalan. `invitation_documents.state` berisi data privat sehingga hanya server dengan service role yang diberi akses. `preview_token_hash` adalah kolom generated dengan indeks unik untuk pencarian tautan pratinjau tanpa membuka isi dokumen.

Adapter server memanggil `public.commit_invitation_document(p_invitation_id uuid, p_expected_version integer, p_state jsonb, p_actor_id uuid, p_action text)` dan menerima versi dokumen baru sebagai integer. Versi `0` membuat undangan draf secara atomik. Versi berikutnya harus sama dengan `invitation_documents.version`, sehingga dua penulis tidak saling menimpa. RPC menyinkronkan slug, status, masa berlaku, admin yang ditugaskan, membuat snapshot saat terbit/terbit ulang, dan mencatat audit perubahan rekening tanpa nilai rekening. `state.version` tetap versi editor, sedangkan `invitation_documents.version` naik pada **setiap** perubahan termasuk RSVP. RPC ini hanya dapat dipanggil service role dan tetap memerlukan otorisasi pengguna di API aplikasi sebelum dipanggil.

Uji pgTAP di `tests/database` memeriksa isolasi dua pasangan, hak baca admin yang ditugaskan, larangan baca token dari browser, FK lintas undangan, CAS, penugasan admin, dan snapshot publikasi. Jalankan dengan `npx supabase test db --local` setelah stack hidup.

## Schema yang disiapkan

Semua data undangan mengacu ke `invitation_id`. Foreign key gabungan mencegah penerima, acara, RSVP, pesanan, dan pembayaran dari undangan berbeda digabungkan. RSVP mempunyai satu baris per penerima/acara dan trigger pembatas kuota. Konten draf dan publikasi disimpan terpisah. Pesanan menyimpan snapshot paket serta masa aktif. Dokumen JSONB adalah tahap peralihan untuk adapter aplikasi; tabel terstruktur tetap disiapkan untuk transaksi pesanan, tamu, RSVP, dan pelaporan saat adapter produksi berkembang.

RLS aktif untuk setiap tabel aplikasi. Pengguna terautentikasi hanya membaca undangannya atau undangan yang ditugaskan; data profil hanya dapat dibaca sendiri. Kolom token, dokumen JSONB lengkap, event pembayaran, dan audit hanya dapat dibaca server. Browser tidak diberi hak tulis tabel. Semua perubahan melalui API server yang memvalidasi sesi, keanggotaan, versi draf, dan izin tindakan. Peran admin ditetapkan oleh operator tepercaya, bukan metadata saat signup. Paket katalog awal berstatus `active=false` sampai harga dan ketentuan layanan ditetapkan.

Bucket `tamuara-private` tidak publik. Path media wajib diawali UUID undangan; pembacaan melalui Storage terikat membership. Tamu membaca media yang benar-benar dipublikasikan melalui endpoint server atau URL bertanda tangan dengan umur terbatas. Anon tidak mempunyai akses langsung ke tabel undangan, RSVP, rekening, tamu, atau transaksi.

## Langkah aktivasi setelah akun layanan tersedia

1. Sebelum melayani pelanggan, pisahkan proyek staging dan production jika kapasitas akun memungkinkan. Uji policy tambahan melalui dua akun owner dan admin yang berbeda.
2. Konfigurasi URL proyek, publishable key untuk klien Auth, serta secret key hanya di server. Nama kunci legacy `anon` dan `service_role` masih diterima sebagai fallback. Pilih sistem kunci token tetap untuk enkripsi AES-256-GCM, simpan sebagai rahasia server, dan dokumentasikan pemulihannya.
3. Isi `.env.local` dari `.env.example`, set `TAMUARA_BACKEND=supabase`, dan buat kunci token stabil 32 byte: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Simpan kunci ini di secret manager dan backup aman. Jangan memakai kunci service role di browser.
4. Konfigurasi Supabase Auth: konfirmasi email, template SMTP, site URL, dan redirect URL `/api/auth/callback` serta `/api/auth/callback?flow=recovery`. Uji daftar, login, keluar, dan pemulihan kata sandi dengan akun nyata.
5. Alur dasar dua pasangan sudah diuji pada provider nyata. Lanjutkan uji penugasan admin, konflik editor/RSVP, pratinjau yang dicabut, media privat, dan snapshot terbit sebelum peluncuran.
6. Hubungkan checkout sandbox Midtrans. Nominal berasal dari snapshot pesanan server. Verifikasi signature notifikasi, cocokkan pesanan/nominal, deduplikasi notifikasi, dan lakukan rekonsiliasi status provider. Redirect browser tidak mengaktifkan paket. Pembayaran tidak menerbitkan undangan otomatis.
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
| `MIDTRANS_SERVER_KEY` | Checkout dan verifikasi pembayaran | Dicadangkan; rahasia server |
| `MIDTRANS_IS_PRODUCTION` | Pemilihan sandbox/live | Dicadangkan; mulai dari `false` |

Dokumentasi acuan: [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Midtrans webhooks](https://docs.midtrans.com/docs/https-notification-webhooks). Migrasi dan alur dasar sudah diuji pada instance Supabase; fitur pelanggan lainnya masih memerlukan pengujian sebelum siap produksi.
