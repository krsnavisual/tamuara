# Deployment dan domain Tamuara

**Pemeriksaan terakhir: 3 Oktober 2026.** Aplikasi masih berjalan lokal dan belum tersedia melalui domain. Panduan ini mencatat konfigurasi yang sudah diterapkan serta urutan aktivasi hosting.

## 1. Status domain

| Komponen | Kondisi |
| --- | --- |
| Registrar | Squarespace, domain `tamuara.com` |
| DNS | Cloudflare Free, nameserver `dell.ns.cloudflare.com` dan `lewis.ns.cloudflare.com` |
| DNSSEC | Penandatanganan Cloudflare aktif; DS baru disimpan di Squarespace. Google DNS membaca nameserver baru dan memvalidasi rantai DNSSEC (`AD=true`, DS cocok). Resolver Cloudflare juga mengonfirmasi respons A valid (`Status=0`, `AD=true`) |
| Dashboard Cloudflare | Masih menunggu verifikasi background saat pemeriksaan terakhir; hasil resolver tidak membuktikan seluruh cache internet sudah diperbarui |
| Domain utama / `www` | A/CNAME masih parking Squarespace, DNS only |
| Hosting | Belum ada deployment Tamuara |

DNSSEC lama dinonaktifkan sementara sebelum perpindahan nameserver, lalu DS Cloudflare didaftarkan setelah DNSKEY dan tanda tangan baru tersedia. Jangan mengaktifkan kembali DNSSEC Squarespace dengan kunci lama selama Cloudflare menjadi pengelola DNS.

## 2. Pilih dan siapkan hosting

Jalur yang sedang dipersiapkan adalah Vercel untuk aplikasi dan Supabase untuk Auth, database, serta Storage. Cloudflare mengelola DNS. Akun Vercel saat pemeriksaan masih Hobby. Hobby dibatasi untuk penggunaan pribadi nonkomersial; peluncuran layanan komersial memerlukan paket yang sesuai, dengan keputusan biaya sebelum langganan diaktifkan. [Vercel: Hobby](https://vercel.com/docs/plans/hobby).

Untuk import GitHub, tambahkan hanya repository `krsnavisual/tamuara` ke akses aplikasi Vercel setelah persetujuan akses persisten. Import repository tersebut tanpa membuat salinan repository baru. Konfigurasi framework adalah Next.js dan root directory adalah root proyek.

Persiapan lokal yang sudah tersedia:

- `vercel.json`: `git.deploymentEnabled=false`, sehingga push Git tidak memicu deployment otomatis. Deployment awal dan berikutnya dilakukan manual sampai kebijakan ini diubah. [Vercel: konfigurasi Git](https://vercel.com/docs/project-configuration/git-configuration).
- `.vercelignore`: mengecualikan file environment, `.data`, backup, hasil tes, dan artefak lokal dari unggahan CLI. Rahasia tetap dimasukkan melalui environment hosting.
- Foto JPG/PNG/WebP dibatasi **4 MiB per berkas** (UI menampilkan 4 MB), dan body multipart dibatasi 4 MiB + 64 KiB. Validasi browser memeriksa seluruh pilihan berkas sebelum request pertama. Batas ini memberi ruang di bawah batas payload Function Vercel 4,5 MB. [Vercel: batas Function](https://vercel.com/docs/functions/limitations).

Typecheck, lint, build production terpisah, 12 tes backend/media terarah, serta satu tes browser penolakan pilihan berkas sudah lulus. Kesesuaian unggahan pada runtime hosting tetap diuji setelah deployment tersedia.

## 3. Environment server

Masukkan nilai melalui pengelola environment proyek hosting. Jangan mengunggah `.env.local` atau menyalin rahasia ke Git, screenshot, maupun catatan deployment.

| Variabel | Nilai / sumber |
| --- | --- |
| `TAMUARA_BACKEND` | `supabase` |
| `TAMUARA_LOCAL_PREVIEW` | `false` |
| `TAMUARA_PAYMENT_MODE` | `disabled` |
| `TAMUARA_APP_URL` | Origin HTTPS deployment uji ketika menguji deployment itu; `https://tamuara.com` saat domain kanonis diaktifkan |
| `NEXT_PUBLIC_SUPABASE_URL` | URL proyek Supabase yang dipakai |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key proyek yang sama |
| `SUPABASE_SECRET_KEY` | Kunci server proyek, disimpan sebagai rahasia |
| `TAMUARA_TOKEN_ENCRYPTION_KEY` | Kunci stabil yang sesuai data/token pada backend yang dipakai, disimpan sebagai rahasia |

Jangan membuat kunci token baru untuk deployment yang membaca data dengan kunci lama: tautan personal dan pratinjau tersimpan memerlukan kunci yang sama. Backup kunci di lokasi privat. Kunci Supabase server dan kunci token tidak memakai awalan `NEXT_PUBLIC_`.

Environment Preview dan Production harus cocok dengan origin masing-masing. Pemeriksaan origin API menolak POST dari hostname lain. Perubahan environment memerlukan redeploy sebelum diuji. Mode lokal memakai disk dan tidak digunakan pada hosting serverless.

## 4. Deploy dan arahkan domain

1. Buat deployment manual dari revisi kode yang sudah ditinjau. Periksa build dan log tanpa mencetak rahasia.
2. Uji alamat HTTPS deployment dengan origin dan callback uji yang sesuai sebelum mengubah record website.
3. Tambahkan `tamuara.com` dan `www.tamuara.com` pada pengaturan domain proyek hosting. Jadikan `https://tamuara.com` origin kanonis dan atur `www` untuk redirect ke domain utama.
4. Salin type/name/value DNS persis dari pengaturan domain proyek hosting. Simpan daftar record parking yang akan diganti. Ganti A domain utama dan CNAME `www` di Cloudflare sesuai nilai yang diberikan hosting; jangan memakai IP atau target tebakan. Pertahankan mode DNS only untuk jalur Vercel ini.
5. Setelah DNS dan sertifikat HTTPS siap, atur `TAMUARA_APP_URL=https://tamuara.com`, sinkronkan Auth berikut, lalu redeploy.

| Pengaturan Supabase Auth | Nilai saat domain aktif |
| --- | --- |
| Site URL | `https://tamuara.com` |
| Redirect URL konfirmasi | `https://tamuara.com/api/auth/callback` |
| Redirect URL pemulihan | `https://tamuara.com/api/auth/callback?flow=recovery` |

Callback lokal dapat dipertahankan selama pengembangan membutuhkan port 3001. Callback domain di atas belum diterapkan saat pemeriksaan terakhir. SMTP, template, dan email nyata mengikuti [panduan email](PANDUAN-EMAIL.md).

## 5. Verifikasi deployment

- HTTPS domain utama berhasil; `www` mengarah ke origin kanonis dan path undangan tetap diteruskan.
- Login/logout, dashboard pasangan/admin, simpan draf, preview privat, serta unggahan dan pembacaan foto berhasil pada hosting.
- Akses privat ditolak untuk pasangan lain; data draf tidak tampil pada undangan terbit.
- Akun dan undangan sintetis digunakan untuk alur publik/RSVP; fixture dibersihkan setelah pengujian. Pembayaran tetap disabled.
- Konfirmasi dan pemulihan email nyata baru dinyatakan lulus setelah custom SMTP aktif dan callback domain diuji.

Catat revisi Git, URL deployment, waktu perubahan DNS/environment, dan hasil pemeriksaan tanpa token atau data pelanggan. Apabila deployment gagal, gunakan deployment terakhir yang sudah diverifikasi bila tersedia; bila belum ada, record parking tersimpan dapat dipulihkan. Rollback kode tidak memulihkan database atau mengubah DNSSEC. Hindari mengembalikan nameserver karena masalah aplikasi.

Deployment berhasil belum berarti platform siap menerima pelanggan berbayar. SMTP nyata, kesiapan pembayaran, backup/pemulihan, ketentuan layanan, dan pilot tetap mengikuti [status implementasi](STATUS-IMPLEMENTASI.md).
