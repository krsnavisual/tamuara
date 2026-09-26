# Status implementasi Tamuara

**26 September 2026 — tahap checkout Midtrans Sandbox**

Proyek Supabase Tamuara terhubung ke GitHub dengan deploy production otomatis nonaktif. Aplikasi port 3001 memakai proyek uji sementara; mode demo lokal tetap tersedia melalui konfigurasi. Domain, SMTP, dan akun merchant belum tersedia. [Panduan email](PANDUAN-EMAIL.md) serta [panduan Midtrans Sandbox](PANDUAN-MIDTRANS-SANDBOX.md) sudah disiapkan. Pembayaran default `disabled`; service checkout hanya mendukung sandbox dengan konfigurasi lengkap dan katalog SQL aktif.

## Sudah berjalan lokal

| Area             | Hasil                                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Pemasaran        | Landing, katalog/filter tema, demo, harga contoh, FAQ, kontak; privasi/ketentuan berupa draf                             |
| Akun             | Daftar/login lokal, cookie HttpOnly, logout, demo pasangan/admin; kata sandi di-hash                                     |
| Multi-pasangan   | Kepemilikan setiap undangan dan akses admin sesuai penugasan, diverifikasi di server                                     |
| Editor           | Profil, acara/zona waktu, cerita, galeri, rekening hadiah, musik URL, tema, validasi, versi draf                         |
| Media            | Upload JPG/PNG/WebP, batas ukuran, optimasi/metadata, akses privat dan snapshot publik                                   |
| Tema             | Classic Elegant, Floral Romantic, Minimal Modern; responsif dan preview langsung                                         |
| Publikasi        | Paket aktif dan pemilik diperlukan; draf terpisah; versi terbit berupa snapshot; slug terkunci setelah publikasi pertama |
| Tamu             | Input/CSV tervalidasi, kelompok, kuota, hak acara, personal link, regenerasi/pencabutan token, tanda kirim manual        |
| RSVP/ucapan      | Per acara, batas kuota/tenggat, upsert jawaban, rekap/CSV, moderasi ucapan                                               |
| Distribusi       | Salin tautan dan buka WhatsApp; tidak mengirim pesan otomatis                                                            |
| Paket            | Harga server, pesanan simulasi, aktivasi idempotent, peningkatan Mandiri → bantuan admin                                 |
| Layanan gabungan | Brief, penugasan admin lokal, catatan, tahapan, revisi, persetujuan versi, publikasi oleh pemilik                        |
| Privasi teknis   | Token terenkripsi + hash, data publik terbatas, no-store, no-referrer, pemeriksaan origin, pembatasan request            |
| Produksi         | Mode backend eksplisit; API production menolak mode lokal tanpa opt-in preview                                           |

## Integrasi Supabase yang sudah ditulis

| Area               | Status                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Akun               | Login, daftar, konfirmasi email, logout, pemulihan kata sandi memakai Supabase Auth; peran dibaca dari profil terverifikasi                                                                                                                                                                                                               |
| Data undangan      | Dokumen JSONB per undangan, metadata tenant, commit transaksional dengan cek versi, snapshot publikasi, audit tindakan dan perubahan rekening                                                                                                                                                                                             |
| Tamu dan publik    | Tautan pribadi, RSVP, ucapan, dan pratinjau melalui adapter server yang memakai token hash dan snapshot publik                                                                                                                                                                                                                            |
| Media              | Bucket privat, optimasi WebP, endpoint aplikasi dengan cek izin tiap request dan `no-store`; unduh langsung dari Storage ditutup                                                                                                                                                                                                          |
| Database           | Tujuh migrasi diterapkan lokal/online; empat berkas pgTAP lulus dengan 175 pemeriksaan. Katalog dan environment pembayaran online belum diaktifkan                                                                                                                                                                                        |
| Provider Supabase  | Tiga akun Auth sintetis (dua owner dan satu admin) menguji login, draf/audit, isolasi pasangan, dan klaim bantuan pada stack lokal dan proyek online                                                                                                                                                                                      |
| Media/pratinjau    | Unggah WebP ke Storage privat, penolakan unduh langsung, baca melalui aplikasi, simpan foto ke draf, baca pratinjau, rotasi dan pencabutan token lulus di proyek online                                                                                                                                                                   |
| Bantuan admin      | Antrean hanya untuk admin, klaim dengan cek versi dan entitlement bantuan berbayar, perubahan status layanan, serta pencabutan akses aplikasi/database/media setelah penurunan peran lulus pada stack lokal dan proyek online                                                                                                             |
| Review/publikasi   | Review admin, persetujuan versi, publikasi hanya oleh pemilik, konflik versi, snapshot awal/terbit ulang, serta pemisahan draf dan konten terbit lulus pada stack lokal dan proyek online                                                                                                                                                 |
| Tamu/ucapan online | Hak acara dan kuota per tamu, penolakan token undangan lain, RSVP bersamaan, ucapan tertunda/duplikat/moderasi, rotasi dan penghapusan token lulus pada stack lokal dan proyek online                                                                                                                                                     |
| Masa berlaku       | Akses publik, RSVP/ucapan, media publik, dan publikasi diperiksa terhadap entitlement SQL aktif yang terhubung dengan pesanan lunas milik pemilik undangan; kedaluwarsa menutup akses                                                                                                                                                     |
| Konfigurasi Auth   | Site URL `http://127.0.0.1:3001` dan callback biasa/pemulihan sudah diterapkan ke proyek online; SMTP pelanggan dan email nyata belum diuji                                                                                                                                                                                               |
| Pembayaran         | Checkout/`refreshPayment` workspace dan webhook `/api/payments/midtrans/webhook` terhubung ke SQL, terbatas sandbox. Nominal/fitur dibekukan server, reservasi idempoten, riwayat pesanan dan sesi hanya untuk pemilik, status provider terautentikasi, aktivasi/revokasi SQL serta dokumen atomik; pembayaran tidak menerbitkan undangan |
| Refund/review      | Pencabutan paket dan peningkatan yang bergantung pada pesanan dasar; kredit peningkatan memakai jumlah yang benar-benar dibayar. Status terminal membatasi event terlambat                                                                                                                                                                |
| Batas pembayaran   | Tanpa konfigurasi merespons 503; `TAMUARA_PAYMENT_MODE=sandbox`, kunci `SB-`, dan katalog aktif diperlukan. Live belum didukung. Pemeriksaan status manual, belum ada job rekonsiliasi; sesi uncertain memerlukan operator, belum ada recovery/reissue                                                                                    |

Adapter belum dianggap siap untuk pelanggan berbayar. Proyek online dipakai sementara karena batas dua proyek gratis belum memungkinkan staging terpisah. Smoke publik lokal/online memakai pesanan lunas **sintetis** sebagai fixture otorisasi. Smoke pembayaran baru memakai provider tiruan terhadap RPC SQL lokal nyata, membersihkan fixture Auth/dokumen/pembayaran/audit, serta memulihkan seluruh katalog; pengujian itu sudah lulus. Belum ada transaksi merchant atau email nyata. Data undangan masih berupa dokumen JSONB per undangan; transaksi RSVP volume tinggi perlu dipisahkan.

## Masih diperlukan untuk pilot berbayar

1. Proyek Supabase staging terpisah saat kapasitas tersedia; siapkan domain dan SMTP mengikuti [panduan email](PANDUAN-EMAIL.md), atur template email, lalu uji email konfirmasi dan pemulihan nyata.
2. Akun merchant sandbox, webhook HTTPS publik, katalog/harga uji, dan pengujian provider sesuai [panduan sandbox](PANDUAN-MIDTRANS-SANDBOX.md). Tambahkan rekonsiliasi terjadwal serta SOP review/refund/recovery. Aktivasi live memerlukan tahap terpisah; tes tiruan belum membuktikan merchant siap.
3. Riwayat beberapa snapshot dan rollback konten. Implementasi lokal saat ini menyimpan draf dan snapshot terbit terbaru.
4. Masa berlaku otomatis tautan preview. Saat ini preview dapat dicabut dengan regenerasi tetapi belum mempunyai TTL.
5. Pengelolaan akun dan audit viewer untuk pengelola platform. Antrean/klaim bantuan Supabase sudah diuji; panel superadmin penuh belum ada.
6. Pengaturan paket/tema melalui admin. Tema/demo dikelola dalam kode; katalog pembayaran SQL masih diaktifkan operator setelah tinjauan harga/ketentuan.
7. QR hadiah unggahan, pengurutan galeri/bagian, dan penyempurnaan editor. Saat ini amplop digital menggunakan detail rekening dan tombol salin.
8. Retensi, ekspor/penghapusan akun, job arsip, pengingat kedaluwarsa, analitik funnel dan monitoring produksi.
9. Backup terjadwal dan uji pemulihan database/media/kunci, staging terpisah, aksesibilitas menyeluruh, Safari/iOS fisik, serta uji beban.
10. Harga dan ketentuan final, materi berizin, domain/merek, SOP layanan, serta pilot 5–10 pasangan.

## Verifikasi tahap ini

- **70 pemeriksaan TypeScript** (52 tes utama + 18 subtes), typecheck, lint, dan build lulus, mencakup domain/HTTP, adapter, serta service pembayaran.
- **175 pemeriksaan SQL** (90 sebelumnya + 85 pembayaran) lulus pada tujuh migrasi lokal: isolasi/RLS/CAS/publikasi/bantuan serta reservasi, harga/kredit, deduplikasi, status terminal, dan revokasi ketergantungan paket.
- `npm.cmd run test:payments:local` lulus: SQL nyata dengan provider sintetis, checkout concurrent sekali, harga server, redirect privat, aktivasi idempoten tanpa publikasi, validasi signature/nominal, refund/review/reversal, pembersihan fixture dan pemulihan katalog.
- **9 tes Chromium** terverifikasi untuk alur pasangan–tamu/admin, desktop/ponsel, CSV, dan UI pembayaran. Empat tes pembayaran terakhir meliputi masa berlaku, revokasi, dan kredit peningkatan.
- Smoke lokal/online Auth, media/pratinjau, bantuan, publikasi ulang/snapshot, token/kuota/RSVP serentak/moderasi, pencabutan akses admin, unpublish/arsip, dan kedaluwarsa entitlement SQL. Seluruh fixture termasuk Storage dibersihkan serta diverifikasi.
- Migrasi pembayaran online dan regresi provider online tahap ini lulus; fixture dibersihkan serta diverifikasi. RPC checkout dengan provider tiruan hanya diuji pada SQL lokal, belum pada merchant atau sebagai tes checkout online. Pengujian merchant Midtrans, email nyata, Safari/iOS fisik, dan uji beban tetap diperlukan sebelum pilot berbayar.

Status ini membedakan fungsi yang sudah dapat dicoba dari gerbang produksi yang belum terpenuhi. Backlog awal tetap menjadi acuan; item MVP tidak ditandai selesai hanya karena UI telah tersedia.
