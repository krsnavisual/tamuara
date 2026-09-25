# Konfigurasi database produksi Tamuara

## Status implementasi

Aplikasi memakai repository lokal secara default saat pengembangan. Akun, undangan, sesi, RSVP, bantuan admin, dan transaksi simulasi disimpan di `.data/tamuara.json`; gambar berada di `.data/media`. Salinan token terenkripsi memakai `.data/encryption.key`. Simpan database, media, dan kunci bersama saat membuat backup lokal. Jangan commit atau membagikan folder `.data`.

Migrasi dan adapter Supabase untuk Auth, undangan, publik, dan media telah ditulis. Belum ada proyek Supabase atau akun merchant, sehingga migrasi belum dijalankan ke layanan nyata dan adapter belum diuji end-to-end dengan provider. Aktifkan adapter hanya setelah migrasi diterapkan: `TAMUARA_BACKEND=supabase`. Checkout Midtrans dan webhook belum dibuat; mode Supabase menolak checkout dan pembayaran simulasi.

## Menjalankan aplikasi lokal

- `npm run dev` mengaktifkan mode demo pada mesin pengembangan.
- `TAMUARA_DATA_DIR` opsional menentukan lokasi data. Jika tidak diisi, gunakan `.data` di root proyek.
- Login demo pemilik/admin menggunakan akun contoh. Akun baru dapat didaftarkan; kata sandi disimpan sebagai hash scrypt. Akun ini belum memverifikasi email dan tidak menyediakan pemulihan kata sandi melalui email.
- Pembayaran adalah simulasi yang diberi label demo. Dana tidak dipindahkan dan paket aktif hanya di repository lokal.
- Repository hanya mendukung **satu proses Node.js dengan disk persisten**. Antrean dalam proses mencegah saling menimpa, tetapi bukan lock antar proses dan tidak sesuai untuk beberapa instance/serverless.
- `npm run start` dalam mode produksi menolak layanan data (503) secara default. `TAMUARA_LOCAL_PREVIEW=true` adalah opt-in khusus untuk menguji hasil build lokal. Jangan gunakan opsi itu sebagai konfigurasi peluncuran pelanggan.

## Menjalankan Supabase lokal

`config.toml` mengarahkan callback Auth ke `http://127.0.0.1:3001` dan mengaktifkan konfirmasi email. Konfigurasi ini tidak memerlukan akun Supabase online. Instal dependensi proyek, jalankan Docker Desktop, lalu dari root proyek jalankan:

```powershell
npx supabase start
npx supabase db reset --local
npx supabase test db --local
```

`db reset --local` **menghapus data di database Supabase lokal** dan menerapkan ulang semua migrasi. Jangan gunakan perintah ini pada proyek staging/produksi. Alamat API, kunci publik, kunci service role, dan Mailpit lokal ditampilkan oleh `npx supabase status`. Salin hanya nilai yang diperlukan ke `.env.local`; kunci service role tidak boleh diberi awalan `NEXT_PUBLIC_`.

Migrasi tambahan `202609250002_harden_access.sql` memperketat hak baca token dan metadata pembayaran serta mengunci kepemilikan pesanan ke undangan. `202609250003_invitation_documents.sql` menyediakan penyimpanan dokumen undangan penuh sebagai jembatan dari model domain yang sudah berjalan. `invitation_documents.state` berisi data privat sehingga hanya server dengan service role yang diberi akses. `preview_token_hash` adalah kolom generated dengan indeks unik untuk pencarian tautan pratinjau tanpa membuka isi dokumen.

Adapter server memanggil `public.commit_invitation_document(p_invitation_id uuid, p_expected_version integer, p_state jsonb, p_actor_id uuid, p_action text)` dan menerima versi dokumen baru sebagai integer. Versi `0` membuat undangan draf secara atomik. Versi berikutnya harus sama dengan `invitation_documents.version`, sehingga dua penulis tidak saling menimpa. RPC menyinkronkan slug, status, masa berlaku, admin yang ditugaskan, membuat snapshot saat terbit/terbit ulang, dan mencatat audit perubahan rekening tanpa nilai rekening. `state.version` tetap versi editor, sedangkan `invitation_documents.version` naik pada **setiap** perubahan termasuk RSVP. RPC ini hanya dapat dipanggil service role dan tetap memerlukan otorisasi pengguna di API aplikasi sebelum dipanggil.

Uji pgTAP di `tests/database` memeriksa isolasi dua pasangan, hak baca admin yang ditugaskan, larangan baca token dari browser, FK lintas undangan, CAS, penugasan admin, dan snapshot publikasi. Jalankan dengan `npx supabase test db --local` setelah stack hidup.

## Schema yang disiapkan

Semua data undangan mengacu ke `invitation_id`. Foreign key gabungan mencegah penerima, acara, RSVP, pesanan, dan pembayaran dari undangan berbeda digabungkan. RSVP mempunyai satu baris per penerima/acara dan trigger pembatas kuota. Konten draf dan publikasi disimpan terpisah. Pesanan menyimpan snapshot paket serta masa aktif. Dokumen JSONB adalah tahap peralihan untuk adapter aplikasi; tabel terstruktur tetap disiapkan untuk transaksi pesanan, tamu, RSVP, dan pelaporan saat adapter produksi berkembang.

RLS aktif untuk setiap tabel aplikasi. Pengguna terautentikasi hanya membaca undangannya atau undangan yang ditugaskan; data profil hanya dapat dibaca sendiri. Kolom token, dokumen JSONB lengkap, event pembayaran, dan audit hanya dapat dibaca server. Browser tidak diberi hak tulis tabel. Semua perubahan melalui API server yang memvalidasi sesi, keanggotaan, versi draf, dan izin tindakan. Peran admin ditetapkan oleh operator tepercaya, bukan metadata saat signup. Paket katalog awal berstatus `active=false` sampai harga dan ketentuan layanan ditetapkan.

Bucket `tamuara-private` tidak publik. Path media wajib diawali UUID undangan; pembacaan melalui Storage terikat membership. Tamu membaca media yang benar-benar dipublikasikan melalui endpoint server atau URL bertanda tangan dengan umur terbatas. Anon tidak mempunyai akses langsung ke tabel undangan, RSVP, rekening, tamu, atau transaksi.

## Langkah aktivasi setelah akun layanan tersedia

1. Siapkan proyek Supabase staging dan production terpisah. Jalankan migrasi terlebih dahulu di staging, lalu uji policy melalui dua akun owner dan admin yang berbeda.
2. Konfigurasi URL proyek, publishable/anon key, serta secret/service-role key hanya di server. Pilih sistem kunci token tetap untuk enkripsi AES-256-GCM, simpan sebagai rahasia server, dan dokumentasikan pemulihannya.
3. Isi `.env.local` dari `.env.example`, set `TAMUARA_BACKEND=supabase`, dan buat kunci token stabil 32 byte: `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Simpan kunci ini di secret manager dan backup aman. Jangan memakai kunci service role di browser.
4. Konfigurasi Supabase Auth: konfirmasi email, template SMTP, site URL, dan redirect URL `/api/auth/callback` serta `/api/auth/callback?flow=recovery`. Uji daftar, login, keluar, dan pemulihan kata sandi dengan akun nyata.
5. Uji isolasi undangan dua pasangan, penugasan admin, konflik editor/RSVP, pratinjau yang dicabut, media privat, dan snapshot terbit pada staging. Adapter server mempertahankan kontrak API lokal tetapi belum diuji pada provider nyata.
6. Hubungkan checkout sandbox Midtrans. Nominal berasal dari snapshot pesanan server. Verifikasi signature notifikasi, cocokkan pesanan/nominal, deduplikasi notifikasi, dan lakukan rekonsiliasi status provider. Redirect browser tidak mengaktifkan paket. Pembayaran tidak menerbitkan undangan otomatis.
7. Uji restore database **dan** media pada staging. Setelah lulus, aktifkan merchant live, domain, logging tanpa token/PII, dan konfigurasi produksi.

## Environment yang akan digunakan adapter produksi

| Variabel | Kegunaan | Status |
| --- | --- | --- |
| `TAMUARA_BACKEND` | `local` atau `supabase` | Wajib `supabase` untuk adapter baru |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek | Dipakai Auth/server |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Kunci public legacy/anon proyek | Dipakai Auth; jangan isi service-role key di sini |
| `SUPABASE_SERVICE_ROLE_KEY` | Kredensial server untuk operasi terkontrol | Dipakai server; rahasia |
| `TAMUARA_TOKEN_ENCRYPTION_KEY` | Kunci enkripsi token produksi | Dipakai server; 64 karakter heksadesimal |
| `MIDTRANS_SERVER_KEY` | Checkout dan verifikasi pembayaran | Dicadangkan; rahasia server |
| `MIDTRANS_IS_PRODUCTION` | Pemilihan sandbox/live | Dicadangkan; mulai dari `false` |

Dokumentasi acuan: [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [Midtrans webhooks](https://docs.midtrans.com/docs/https-notification-webhooks). Migrasi ini perlu diuji pada instance Supabase sebelum dinyatakan siap produksi.
