# Konfigurasi email akun Tamuara

Panduan ini menyiapkan email konfirmasi pendaftaran dan pemulihan kata sandi. Domain dan layanan SMTP belum tersedia; langkah berikut dijalankan setelah keduanya dipilih. Email sungguhan belum diuji. Konfigurasi Auth saat ini memakai alamat pengembangan `http://127.0.0.1:3001`.

## 1. Siapkan domain dan identitas pengirim

1. Daftarkan domain yang akan dimiliki Tamuara dan pastikan Anda dapat mengubah DNS-nya. Nama domain dalam panduan ini hanyalah contoh, bukan domain yang telah dibeli.
2. Pilih layanan email transaksional yang menyediakan SMTP dan verifikasi domain. Periksa kuota, log pengiriman, pembatasan penerima saat akun masih sandbox, serta prosedur aktivasi layanan pada dokumentasi provider pilihan.
3. Tentukan nama pengirim **Tamuara** dan alamat seperti `akun@auth.example.com`. Subdomain pengiriman dapat membantu memisahkan reputasi email akun dari pemasaran; alamat harus sesuai identitas yang diverifikasi provider. Contoh alur verifikasi tersedia pada [dokumentasi domain Resend](https://resend.com/docs/dashboard/domains/introduction), tanpa mewajibkan provider tersebut.

## 2. Verifikasi DNS

Tambahkan record yang diberikan provider ke pengelola DNS domain:

| Record | Tujuan |
| --- | --- |
| SPF | Menyatakan server yang boleh mengirim email untuk domain. |
| DKIM | Memverifikasi tanda tangan domain pengirim dan keutuhan pesan. |
| DMARC | Menentukan kebijakan penerima atas email yang gagal autentikasi serta laporan domain. |

Salin **type, name/host, value, dan priority jika ada** persis dari provider. Tidak ada nilai SPF/DKIM/DMARC universal untuk ditempel. Periksa record yang sudah ada sebelum mengubahnya; ikuti panduan provider jika perlu menggabungkan konfigurasi. Tunggu sampai status domain pengiriman terverifikasi. Penjelasan fungsi dan ketergantungan nilainya tersedia pada [Cloudflare: email DNS records](https://developers.cloudflare.com/dns/manage-dns-records/how-to/email-records/).

## 3. Isi SMTP pada Supabase

Buka proyek Tamuara → **Authentication → Emails → SMTP Settings**, aktifkan custom SMTP, lalu isi:

| Kolom | Nilai yang disiapkan |
| --- | --- |
| Sender email | Alamat pengirim yang telah diverifikasi. |
| Sender name | `Tamuara` |
| Host | Host SMTP dari provider. |
| Port | Port dengan TLS/STARTTLS yang didukung provider; jangan menebak dari contoh. |
| Username | Username SMTP dari provider. |
| Password | Kredensial SMTP khusus dari provider. |

Simpan kredensial langsung di dashboard dan password manager privat. SMTP dikirim oleh Supabase Auth, sehingga aplikasi tidak memerlukan password SMTP di `.env.local`. Jangan memasukkannya ke kode, Git, tangkapan layar, atau percakapan.

SMTP bawaan Supabase hanya mengirim ke alamat anggota tim proyek, memiliki kuota sangat terbatas, dan bukan layanan production. Custom SMTP diperlukan untuk penerima pelanggan. Setelah aktivasi, periksa **Authentication → Rate Limits** dan kuota provider sebelum membuka pendaftaran. [Supabase: custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

## 4. Cocokkan alamat aplikasi dan callback

Untuk pengembangan saat ini:

| Pengaturan | Nilai |
| --- | --- |
| `TAMUARA_APP_URL` pada `.env.local` | `http://127.0.0.1:3001` |
| Auth → URL Configuration → Site URL | `http://127.0.0.1:3001` |
| Redirect URLs | `http://127.0.0.1:3001/api/auth/callback` |
| Redirect URLs, pemulihan | `http://127.0.0.1:3001/api/auth/callback?flow=recovery` |

Jalankan aplikasi pada port 3001. Buka tautan email di komputer yang menjalankan aplikasi; `127.0.0.1` pada ponsel mengarah ke ponsel itu sendiri.

Saat domain website dan hosting HTTPS siap, ubah `TAMUARA_APP_URL` pada environment hosting dan Site URL ke origin production. Tambahkan kedua callback dengan origin HTTPS yang sama, misalnya `https://example.com/api/auth/callback` dan `https://example.com/api/auth/callback?flow=recovery`. Pilih satu hostname kanonis. Restart/redeploy aplikasi setelah perubahan environment; uji dengan email baru. Gunakan path callback tepat untuk production. [Supabase: redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## 5. Sesuaikan isi email tanpa merusak tautannya

Pada **Authentication → Emails → Templates**, ubah teks **Confirm sign up** dan **Reset password** ke bahasa Indonesia. Contoh subjek: “Konfirmasi akun Tamuara” dan “Atur ulang kata sandi Tamuara”. Beri petunjuk singkat untuk mengabaikan pesan jika penerima tidak meminta tindakan tersebut.

Pertahankan `href="{{ .ConfirmationURL }}"` pada tombol. Callback aplikasi saat ini menerima `code` dan menukarnya menjadi sesi; jangan menggantinya dengan tautan `token_hash` tanpa perubahan kode dan pengujian. Matikan click/link tracking provider agar tautan Auth tidak ditulis ulang. [Supabase: email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## 6. Uji dengan alamat yang Anda miliki

Gunakan akun uji dan kotak masuk milik Anda. Jangan memakai alamat pelanggan untuk percobaan.

1. Buka `/daftar`, buat akun baru, dan periksa pesan konfirmasi di inbox/spam. Buka tautan menggunakan browser/profil yang digunakan mendaftar agar cookie alur autentikasi tersedia. Pastikan akun masuk ke `/app` dan dapat membuat draf.
2. Keluar, buka `/lupa-kata-sandi`, dan minta pemulihan untuk akun uji yang sudah dikonfirmasi. Dari email terbaru, pastikan callback menuju `/atur-kata-sandi`. Ganti kata sandi, keluar, lalu masuk dengan kata sandi baru.
3. Periksa tautan yang telah dipakai atau kedaluwarsa: aplikasi harus menampilkan kegagalan. Untuk pemulihan, minta email baru dari `/lupa-kata-sandi`. Catat waktu, jenis alur, dan hasil; jangan menyimpan token atau kata sandi dalam catatan pengujian.

**Kirim ulang konfirmasi masih perlu dikembangkan.** Aplikasi saat ini belum menyediakan aksi atau tombol resend. Setelah tersedia, uji akun yang belum dikonfirmasi, jeda permintaan, email terbaru, dan penolakan sesi sebelum konfirmasi. Jangan membuka pendaftaran pelanggan sampai alur ini selesai.

## Jika pengiriman atau tautan gagal

| Gejala | Pemeriksaan |
| --- | --- |
| `Email address not authorized` | Custom SMTP belum aktif atau penerima dibatasi provider. |
| HTTP 429 / permintaan terlalu sering | Tunggu jeda; periksa rate limit Supabase dan kuota provider. Jangan mengulang terus. |
| SMTP gagal | Periksa host, port, kredensial, identitas pengirim, dan log provider/Auth; jangan menyalin rahasia ke log. |
| Pesan masuk spam | Periksa verifikasi DNS dan header autentikasi pesan serta log pengiriman provider. |
| Tautan menuju alamat salah | Cocokkan Site URL, allowlist, `TAMUARA_APP_URL`, dan email yang baru dibuat. |
| Konfirmasi/pemulihan gagal | Pakai tautan terbaru di browser asal, periksa kedaluwarsa dan tracking. Pemindai keamanan email dapat mengonsumsi tautan; bila berulang, alur konfirmasi perlu disesuaikan dan diuji. |

Rate limit berlaku di Supabase maupun provider; 429 berarti batas permintaan tercapai. Kuota harus dibaca dari konfigurasi saat aktivasi, karena dapat berubah. [Supabase: rate limits](https://supabase.com/docs/guides/auth/rate-limits). Batasan tracking dan pemindaian tautan dijelaskan pada [Supabase: email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Checklist sebelum pendaftaran pelanggan dibuka

- [ ] Domain dimiliki Tamuara dan DNS pengirim terverifikasi.
- [ ] Custom SMTP aktif dengan pengirim Tamuara dan kredensial tersimpan privat.
- [ ] Konfirmasi email tetap aktif; template dan tracking telah diperiksa.
- [ ] Origin HTTPS aplikasi, Site URL, dan dua callback production cocok.
- [ ] Konfirmasi dan pemulihan kata sandi lulus melalui email nyata.
- [ ] Aksi kirim ulang konfirmasi dikembangkan dan lulus pengujian email nyata.
- [ ] Kuota dan log pengiriman dapat dipantau; prosedur rotasi kredensial tersedia.

Checklist ini hanya menyelesaikan kesiapan email akun. Aktivasi pembayaran dan paket pelanggan mengikuti [status implementasi](STATUS-IMPLEMENTASI.md).
