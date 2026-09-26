# Panduan Midtrans Sandbox untuk Tamuara

Panduan ini menyiapkan pengujian pembayaran paket undangan. Akun merchant, kunci sandbox, dan URL webhook publik belum dikonfigurasi. **Tes memakai respons provider tiruan atau pesanan Supabase sintetis belum membuktikan integrasi merchant Midtrans berhasil.** Catat hasil pengujian merchant terpisah setelah konfigurasi tersedia.

Pembayaran paket adalah pembelian layanan Tamuara oleh pasangan. Informasi rekening hadiah pada undangan tetap dikelola sebagai fitur terpisah.

## 1. Buat akun dan pilih Sandbox

1. Buka [Dashboard Midtrans](https://dashboard.midtrans.com/login), pilih pendaftaran akun, lalu isi identitas bisnis, email, dan nomor telepon yang dimiliki.
2. Verifikasi email sesuai petunjuk Midtrans.
3. Pilih **Sandbox** pada pemilih environment dashboard. Akun menyediakan sandbox untuk tes; aktivasi merchant production merupakan proses terpisah. Pendaftaran sandbox dapat dilakukan sebelum onboarding production selesai. [Panduan akun resmi](https://docs.midtrans.com/docs/dashboard-basics).
4. Di **Settings > Access Keys**, ambil **Server Key milik Sandbox**. Kunci sandbox dan production berbeda. Simpan nilai di konfigurasi privat; jangan kirim ke chat, screenshot, issue, atau repository GitHub. [Penjelasan kunci resmi](https://docs.midtrans.com/docs/midtrans-account).

Tamuara memakai halaman pembayaran **Snap Redirect** yang dihosting Midtrans. Browser membuka `redirect_url` dari backend, sehingga konfigurasi ini tidak membutuhkan Client Key atau `snap.js`. Pembuatan transaksi tetap memakai Server Key pada server. [Metode Snap Redirect](https://docs.midtrans.com/docs/snap-snap-integration-guide).

## 2. Isi konfigurasi server

Tambahkan variabel berikut ke `.env.local` pada komputer pengembangan. Contoh berisi placeholder, bukan kunci yang dapat digunakan:

```dotenv
TAMUARA_PAYMENT_MODE=disabled
MIDTRANS_IS_PRODUCTION=false
MIDTRANS_SERVER_KEY=
TAMUARA_APP_URL=https://HOST-UJI-ANDA
```

| Variabel                 | Nilai saat persiapan         | Saat pengujian merchant                               |
| ------------------------ | ---------------------------- | ----------------------------------------------------- |
| `TAMUARA_PAYMENT_MODE`   | `disabled`                   | `sandbox`, setelah seluruh prasyarat di bawah siap    |
| `MIDTRANS_IS_PRODUCTION` | `false`                      | Tetap `false`                                         |
| `MIDTRANS_SERVER_KEY`    | Kosong                       | Server Key Sandbox sendiri dengan awalan `SB-`        |
| `TAMUARA_APP_URL`        | Origin aplikasi yang dipakai | Origin HTTPS publik lingkungan uji, tanpa path `/app` |

Mode pembayaran aplikasi pada tahap ini hanya `disabled` atau `sandbox`. Production belum didukung oleh alur checkout ini. Jangan memakai kunci production atau mengubah flag production untuk menerima uang nyata. Biarkan `disabled` selama konfigurasi belum lengkap. Pada hosting uji, masukkan rahasia melalui pengelola environment server; `.env.local` tidak perlu diunggah.

Jangan menambahkan awalan `NEXT_PUBLIC_` pada Server Key. Pastikan `.env.local` tetap diabaikan Git. Setelah mengubah environment, mulai ulang proses aplikasi agar nilai baru terbaca. Mengisi kunci saja tidak mengaktifkan katalog paket SQL.

## 3. Siapkan URL HTTPS yang dapat dijangkau Midtrans

Alamat `http://127.0.0.1:3001` hanya dapat diakses dari komputer sendiri. Midtrans tidak dapat mengirim webhook ke localhost, URL di balik VPN, atau endpoint yang meminta login/password. Gunakan deployment uji dengan HTTPS, atau tunnel HTTPS sementara yang diteruskan ke aplikasi lokal. Domain sendiri tidak wajib untuk percobaan tunnel; tentukan domain dan hosting sebelum pelanggan menggunakan layanan. [Persyaratan webhook resmi](https://docs.midtrans.com/docs/https-notification-webhooks).

Gunakan origin milik Anda menggantikan `https://HOST-UJI-ANDA`:

| Pengaturan               | URL                                                   |
| ------------------------ | ----------------------------------------------------- |
| Payment Notification URL | `https://HOST-UJI-ANDA/api/payments/midtrans/webhook` |
| Finish Redirect URL      | `https://HOST-UJI-ANDA/app`                           |
| Unfinished Redirect URL  | `https://HOST-UJI-ANDA/app`                           |
| Error Redirect URL       | `https://HOST-UJI-ANDA/app`                           |

Di dashboard **Sandbox**, cari pengaturan Payment Notification URL pada pengaturan pembayaran/Configuration. Atur redirect Snap pada **Snap Preference > System Settings**. Label menu dapat berbeda antar tampilan dashboard; field tujuan yang dibutuhkan tetap seperti tabel. URL redirect yang dikirim dalam request dapat mengungguli konfigurasi dashboard. [Panduan Snap](https://docs.midtrans.com/docs/snap-snap-integration-guide), [Payment Settings](https://docs.midtrans.com/docs/payment-settings).

Pastikan `TAMUARA_APP_URL` sama dengan origin yang dipakai untuk membuka aplikasi. Tunnel dengan hostname berubah memerlukan pembaruan environment serta URL dashboard. Jika login Supabase dilakukan melalui origin HTTPS baru, tambahkan callback origin tersebut pada daftar Redirect URLs Supabase sesuai [panduan email](PANDUAN-EMAIL.md). Endpoint webhook menerima request provider tanpa sesi pengguna; keasliannya diperiksa server.

Kembali ke `/app`, parameter URL, atau tampilan sukses di browser tidak membuktikan pembayaran lunas. Server harus memverifikasi notifikasi dan status provider sebelum mengaktifkan paket. [Verifikasi notifikasi resmi](https://docs.midtrans.com/docs/https-notification-webhooks).

## 4. Tinjau harga sebelum mengaktifkan katalog

Tabel `public.plans` memulai paket dengan `active=false`. Nilai harga pada seed masih perlu keputusan bisnis: harga, masa berlaku, fitur, layanan admin, serta ketentuan pembatalan/refund. Pesanan menggunakan snapshot harga server; browser tidak menentukan nominal.

Setelah keputusan tersebut disetujui, operator dapat memeriksa dan mengaktifkan paket tertentu lewat SQL Editor atau Table Editor Supabase **pada proyek uji saja**. Gunakan akses operator, bukan kredensial browser. Contoh pembacaan aman:

```sql
select id, display_name, amount_idr, features, active
from public.plans
order by id;
```

Tinjau setiap baris sebelum mengubah harga atau `active`. Jangan mengaktifkan semua paket tanpa pemeriksaan. Catat nilai yang dipakai untuk pengujian agar nominal pada order, dashboard Midtrans, dan status terverifikasi dapat dibandingkan. Setelah uji selesai, matikan kembali katalog bila lingkungan belum siap dipakai. Tidak ada perubahan katalog yang dilakukan oleh panduan ini.

## 5. Jalankan transaksi dengan simulator

Gunakan akun pasangan uji dan undangan uji; pilih paket, buka Snap Redirect, lalu gunakan kredensial/simulator yang tercantum pada [Testing Payment on Sandbox](https://docs.midtrans.com/docs/testing-payment-on-sandbox). Jangan membayar VA atau QR sandbox memakai bank/e-wallet nyata. Midtrans menjelaskan bahwa referensi sandbox bisa beririsan dengan sistem nyata sehingga transfer riil dapat salah tujuan. Gunakan lingkungan uji terbatas untuk akun yang mengetahui bahwa transaksi adalah simulasi.

Catat order ID Tamuara, ID transaksi Midtrans, metode bayar, nominal, waktu, status dashboard, dan hasil aplikasi. Jangan mencatat Server Key, signature, token pembayaran, atau data kartu ke dokumentasi/log publik.

GET Status dapat mengembalikan `404` sebelum pelanggan memilih metode bayar di Snap. Kondisi tersebut tidak otomatis berarti order harus dibuat ulang. Rekonsiliasi pesanan yang ada terlebih dahulu, terutama setelah gangguan jaringan. [Siklus status resmi](https://docs.midtrans.com/docs/transaction-status-cycle).

Jika proses terhenti sebelum request provider, atau respons pembuatan/redirect hilang, pesanan dapat berada pada kondisi **uncertain** dan memblokir percobaan checkout baru. Refresh status `404` tidak dapat membuktikan bahwa sesi Snap belum pernah dibuat. Operator perlu memeriksa order ID yang sama pada dashboard merchant dan menangani kasus melalui dukungan/manual sebelum menentukan percobaan berikutnya. Tamuara belum menyediakan alat recovery atau penerbitan ulang sesi; jangan menghapus pesanan atau memaksa request pembuatan ulang untuk melewati kondisi ini.

### Matriks pengujian merchant yang harus dicatat

Status seluruh skenario di bawah **belum diuji pada merchant**. Beberapa skenario membutuhkan harness pengujian atau dukungan metode tertentu; jangan mengubah database untuk menyamarkan kegagalan integrasi.

| Skenario                                         | Hasil yang perlu diperiksa                                                                                       |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Pending / Snap ditutup sebelum bayar             | Order tetap belum lunas; entitlement tidak aktif                                                                 |
| Settlement / capture kartu dengan fraud diterima | Nominal dan order cocok; paket aktif sekali; undangan tidak diterbitkan otomatis                                 |
| Deny / failure                                   | Paket tidak aktif; pelanggan melihat status yang sesuai                                                          |
| Cancel                                           | Paket tidak aktif; order lama tetap dapat ditelusuri                                                             |
| Expire                                           | Transaksi tidak dapat dipakai melunasi order baru; paket tidak aktif                                             |
| Klik checkout berulang / retry request           | Tidak menciptakan tagihan ganda untuk percobaan yang sama                                                        |
| Webhook duplikat                                 | Hasil idempoten; tidak memperpanjang atau mengaktifkan paket berulang                                            |
| Webhook terlambat / urutan berubah               | Keputusan mengikuti status terkini terautentikasi, bukan status mentah notifikasi                                |
| Nominal, order ID, atau signature tidak cocok    | Ditolak; entitlement tidak diberikan                                                                             |
| Capture kartu tanpa fraud accept / challenge     | Masuk pemeriksaan; paket belum aktif                                                                             |
| Refund penuh / parsial / chargeback              | Terdeteksi dan mengikuti kebijakan revoke/review yang telah ditetapkan; refund tidak dilakukan otomatis oleh uji |
| Reversal settlement menjadi deny                 | Status terkini ditangani sebagai reversal/pemeriksaan, bukan diabaikan sebagai pesan pending lama                |
| Timeout saat pembuatan transaksi                 | Rekonsiliasi order yang sama sebelum membuat transaksi baru                                                      |
| Webhook tidak sampai / koneksi status gagal      | Belum menyatakan lunas tanpa verifikasi; pemulihan/retry dapat ditelusuri                                        |
| Masa berlaku paket habis                         | Akses publik mengikuti entitlement SQL yang berlaku                                                              |

Midtrans mencatat beberapa metode dapat mengalami reversal sesudah settlement. Ketersediaan refund dan metode lain bergantung pada konfigurasi merchant; tandai skenario yang tidak dapat disimulasikan, berikut alasannya. [Siklus status dan reversal](https://docs.midtrans.com/docs/transaction-status-cycle).

## 6. Bukti sebelum melanjutkan

- [ ] Akun sendiri berada di environment Sandbox.
- [ ] Server Key tersimpan hanya pada konfigurasi privat server.
- [ ] Mode aplikasi `sandbox`, flag production `false`, backend Supabase dan migrasi pembayaran siap.
- [ ] Harga serta fitur paket uji ditinjau; paket yang diperlukan aktif pada katalog uji.
- [ ] Webhook HTTPS publik tersimpan di dashboard sandbox dan origin aplikasi cocok.
- [ ] Redirect kembali ke `/app`; status di browser tidak dipakai sebagai bukti pelunasan.
- [ ] Minimal satu transaksi simulator sukses dan satu transaksi gagal/pending diverifikasi dari provider sampai aplikasi.
- [ ] Skenario duplikat, urutan event, mismatch, gangguan jaringan, dan review dicatat dengan hasil atau keterbatasan yang jelas.
- [ ] Tidak ada pembayaran dana nyata; semua akun/order pengujian dikenali sebagai data uji.

SMTP/domain untuk email dikerjakan menggunakan [panduan email Tamuara](PANDUAN-EMAIL.md). Penerimaan pembayaran production memerlukan pekerjaan dan keputusan lanjutan: aktivasi merchant, domain/hosting, konfigurasi rahasia production, persetujuan harga dan ketentuan, operasional rekonsiliasi/refund, serta pengujian tersendiri.
