# Status implementasi Tamuara

**26 September 2026 — tahap integrasi Supabase**

Proyek Supabase Tamuara telah dibuat dan terhubung ke GitHub dengan deploy production otomatis nonaktif. Aplikasi yang terbuka pada port 3001 memakai backend Supabase pada proyek uji sementara. Mode demo lokal tetap tersedia melalui konfigurasi. Domain, SMTP pelanggan, dan akun merchant belum tersedia; [panduan konfigurasi email](PANDUAN-EMAIL.md) sudah disiapkan.

## Sudah berjalan lokal

| Area | Hasil |
| --- | --- |
| Pemasaran | Landing, katalog/filter tema, demo, harga contoh, FAQ, kontak; privasi/ketentuan berupa draf |
| Akun | Daftar/login lokal, cookie HttpOnly, logout, demo pasangan/admin; kata sandi di-hash |
| Multi-pasangan | Kepemilikan setiap undangan dan akses admin sesuai penugasan, diverifikasi di server |
| Editor | Profil, acara/zona waktu, cerita, galeri, rekening hadiah, musik URL, tema, validasi, versi draf |
| Media | Upload JPG/PNG/WebP, batas ukuran, optimasi/metadata, akses privat dan snapshot publik |
| Tema | Classic Elegant, Floral Romantic, Minimal Modern; responsif dan preview langsung |
| Publikasi | Paket aktif dan pemilik diperlukan; draf terpisah; versi terbit berupa snapshot; slug terkunci setelah publikasi pertama |
| Tamu | Input/CSV tervalidasi, kelompok, kuota, hak acara, personal link, regenerasi/pencabutan token, tanda kirim manual |
| RSVP/ucapan | Per acara, batas kuota/tenggat, upsert jawaban, rekap/CSV, moderasi ucapan |
| Distribusi | Salin tautan dan buka WhatsApp; tidak mengirim pesan otomatis |
| Paket | Harga server, pesanan simulasi, aktivasi idempotent, peningkatan Mandiri → bantuan admin |
| Layanan gabungan | Brief, penugasan admin lokal, catatan, tahapan, revisi, persetujuan versi, publikasi oleh pemilik |
| Privasi teknis | Token terenkripsi + hash, data publik terbatas, no-store, no-referrer, pemeriksaan origin, pembatasan request |
| Produksi | Mode backend eksplisit; API production menolak mode lokal tanpa opt-in preview |

## Integrasi Supabase yang sudah ditulis

| Area | Status |
| --- | --- |
| Akun | Login, daftar, konfirmasi email, logout, pemulihan kata sandi memakai Supabase Auth; peran dibaca dari profil terverifikasi |
| Data undangan | Dokumen JSONB per undangan, metadata tenant, commit transaksional dengan cek versi, snapshot publikasi, audit tindakan dan perubahan rekening |
| Tamu dan publik | Tautan pribadi, RSVP, ucapan, dan pratinjau melalui adapter server yang memakai token hash dan snapshot publik |
| Media | Bucket privat, optimasi WebP, endpoint aplikasi dengan cek izin tiap request dan `no-store`; unduh langsung dari Storage ditutup |
| Database | Enam migrasi diterapkan ke Supabase lokal dan online; tiga berkas pgTAP lulus dengan 90 pemeriksaan |
| Provider Supabase | Tiga akun Auth sintetis (dua owner dan satu admin) menguji login, draf/audit, isolasi pasangan, dan klaim bantuan pada stack lokal dan proyek online |
| Media/pratinjau | Unggah WebP ke Storage privat, penolakan unduh langsung, baca melalui aplikasi, simpan foto ke draf, baca pratinjau, rotasi dan pencabutan token lulus di proyek online |
| Bantuan admin | Antrean hanya untuk admin, klaim dengan cek versi dan entitlement bantuan berbayar, perubahan status layanan, serta pencabutan akses aplikasi/database/media setelah penurunan peran lulus pada stack lokal dan proyek online |
| Review/publikasi | Review admin, persetujuan versi, publikasi hanya oleh pemilik, konflik versi, snapshot awal/terbit ulang, serta pemisahan draf dan konten terbit lulus pada stack lokal dan proyek online |
| Tamu/ucapan online | Hak acara dan kuota per tamu, penolakan token undangan lain, RSVP bersamaan, ucapan tertunda/duplikat/moderasi, rotasi dan penghapusan token lulus pada stack lokal dan proyek online |
| Masa berlaku | Akses publik, RSVP/ucapan, media publik, dan publikasi diperiksa terhadap entitlement SQL aktif yang terhubung dengan pesanan lunas milik pemilik undangan; kedaluwarsa menutup akses |
| Konfigurasi Auth | Site URL `http://127.0.0.1:3001` dan callback biasa/pemulihan sudah diterapkan ke proyek online; SMTP pelanggan dan email nyata belum diuji |
| Pembayaran | Modul Midtrans server dan 12 tes unit disiapkan untuk signature, status provider, identitas transaksi, serta nominal; belum ada endpoint checkout/webhook aktif atau panggilan merchant nyata; simulasi hanya di mode lokal |

Adapter Supabase belum dianggap siap melayani pelanggan berbayar. Proyek Tamuara dipakai sementara untuk pengujian karena batas dua proyek gratis belum memungkinkan staging online terpisah. Smoke test lokal dan online memakai pesanan lunas serta entitlement **sintetis** yang dibuat langsung sebagai fixture otorisasi, bukan transaksi pelanggan. Pengujian membersihkan dan memverifikasi ulang akun Auth, profil, undangan, dokumen, publikasi, keanggotaan, audit, pesanan/entitlement, metadata media, dan objek Storage. Seluruh data undangan di mode Supabase saat ini disimpan sebagai satu dokumen per undangan; untuk volume RSVP tinggi, pecah transaksi ke tabel terstruktur yang sudah disiapkan.

## Masih diperlukan untuk pilot berbayar

1. Proyek Supabase staging terpisah saat kapasitas tersedia; siapkan domain dan SMTP mengikuti [panduan email](PANDUAN-EMAIL.md), atur template email, lalu uji email konfirmasi dan pemulihan nyata.
2. Akun merchant, endpoint checkout sandbox dan webhook Midtrans memakai modul verifikasi yang telah disiapkan; ikuti [rencana integrasi pembayaran](INTEGRASI-PEMBAYARAN.md), uji rekonsiliasi, pembayaran gagal/kedaluwarsa/refund, lalu aktivasi live. Tes unit modul belum membuktikan transaksi merchant nyata.
3. Riwayat beberapa snapshot dan rollback konten. Implementasi lokal saat ini menyimpan draf dan snapshot terbit terbaru.
4. Masa berlaku otomatis tautan preview. Saat ini preview dapat dicabut dengan regenerasi tetapi belum mempunyai TTL.
5. Pengelolaan akun dan audit viewer untuk pengelola platform. Antrean/klaim bantuan Supabase sudah diuji; panel superadmin penuh belum ada.
6. Pengaturan paket/tema melalui admin. Katalog contoh saat ini dikelola dalam kode.
7. QR hadiah unggahan, pengurutan galeri/bagian, dan penyempurnaan editor. Saat ini amplop digital menggunakan detail rekening dan tombol salin.
8. Retensi, ekspor/penghapusan akun, job arsip, pengingat kedaluwarsa, analitik funnel dan monitoring produksi.
9. Backup terjadwal dan uji pemulihan database/media/kunci, staging terpisah, aksesibilitas menyeluruh, Safari/iOS fisik, serta uji beban.
10. Harga dan ketentuan final, materi berizin, domain/merek, SOP layanan, serta pilot 5–10 pasangan.

## Verifikasi tahap ini

- TypeScript, lint, build, dan 57 pemeriksaan tes TypeScript (39 tes utama dan 18 subtes) lulus setelah perluasan verifikasi publikasi dan modul pembayaran.
- Tes backend/integrasi: isolasi, peran, konflik versi/persetujuan, pembayaran simulasi, token/kuota/RSVP, moderasi, media, production fail-closed.
- Tes HTTP asal request dengan host pengembangan dan penolakan lintas situs.
- Tes browser Chromium: tampilan desktop dan 390 px, pembuatan sampai publikasi, RSVP/ucapan tamu, alur review admin lokal, dan validasi/persistensi impor CSV.
- Smoke test lokal dan online: Auth, draf/audit, isolasi, media privat/WebP melalui aplikasi, penolakan unduh Storage langsung, rotasi token pratinjau, antrean/klaim admin dengan fixture entitlement, dan pencabutan akses setelah penurunan peran lulus.
- Smoke test publikasi lokal dan online: review admin, publikasi oleh pemilik, konflik versi, jumlah snapshot SQL satu pada terbit pertama dan dua setelah terbit ulang, respons publik tanpa cache/data privat, rekening hadiah, hak acara/kuota tamu, token undangan lain, RSVP bersamaan dengan CAS/upsert tanpa mengubah versi editor, moderasi ucapan, rotasi/penghapusan token, serta isolasi draf lulus.
- Penarikan publikasi dan arsip menutup halaman/media publik. Kedaluwarsa entitlement SQL menolak akses publik GET/POST/media dan publikasi dengan 402. Pembersihan fixture publikasi, keanggotaan, pesanan, Storage, dan Auth diverifikasi.
- Screenshot pemasaran, dashboard, editor, serta demo tema ditinjau.

Hasil yang sudah diverifikasi: **90 pemeriksaan SQL pgTAP, 57 pemeriksaan tes TypeScript, dan 5 tes browser Chromium**, typecheck, lint, build, serta smoke test lokal dan online untuk alur di atas. Integrasi email nyata dan pembayaran pelanggan masih perlu diuji sebelum pilot berbayar. Checkout Supabase tetap merespons 503 sampai merchant dan endpoint checkout/webhook tersedia.

Status ini membedakan fungsi yang sudah dapat dicoba dari gerbang produksi yang belum terpenuhi. Backlog awal tetap menjadi acuan; item MVP tidak ditandai selesai hanya karena UI telah tersedia.
