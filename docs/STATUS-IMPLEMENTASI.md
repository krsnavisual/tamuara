# Status implementasi Tamuara

**25 September 2026 — tahap integrasi Supabase**

Pengguna mengonfirmasi belum memiliki proyek Supabase atau akun merchant. Aplikasi lokal tetap berfungsi, dan kode integrasi Supabase disiapkan untuk dicoba pada staging setelah akun serta migrasi tersedia.

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
| Media | Bucket privat, optimasi WebP, izin pasangan/admin/pratinjau/tamu publik, pembersihan objek bila metadata gagal |
| Database | Migrasi schema/RLS dan tes pgTAP disiapkan; belum dijalankan pada Supabase lokal atau proyek eksternal |
| Pembayaran | Checkout produksi dinonaktifkan sampai merchant dan webhook tersedia; simulasi hanya di mode lokal |

Adapter Supabase belum dianggap siap peluncuran. Belum ada proyek dan kredensial untuk uji integrasi layanan nyata. Docker Desktop di mesin ini belum menyediakan daemon sehingga tes SQL lokal belum dapat dijalankan. Seluruh data undangan di mode Supabase saat ini disimpan sebagai satu dokumen per undangan; untuk volume RSVP tinggi, pecah transaksi ke tabel terstruktur yang sudah disiapkan.

## Masih diperlukan untuk pilot berbayar

1. Proyek Supabase staging, penerapan dan pengujian migrasi/RLS, uji dua akun pasangan dan admin, serta konfigurasi Auth, email, callback, Storage, dan domain.
2. Akun merchant, integrasi checkout sandbox dan webhook Midtrans yang diverifikasi; rekonsiliasi, pembayaran gagal/kedaluwarsa/refund, lalu aktivasi live.
4. Riwayat beberapa snapshot dan rollback konten. Implementasi lokal saat ini menyimpan draf dan snapshot terbit terbaru.
5. Masa berlaku otomatis tautan preview. Saat ini preview dapat dicabut dengan regenerasi tetapi belum mempunyai TTL.
6. Pengelolaan akun/penugasan dan audit viewer untuk pengelola platform. Admin lokal mempunyai penugasan contoh; belum ada panel superadmin penuh.
7. Pengaturan paket/tema melalui admin. Katalog contoh saat ini dikelola dalam kode.
8. QR hadiah unggahan, pengurutan galeri/bagian, dan penyempurnaan editor. Saat ini amplop digital menggunakan detail rekening dan tombol salin.
9. Retensi, ekspor/penghapusan akun, job arsip, pengingat kedaluwarsa, analitik funnel dan monitoring produksi.
10. Backup terjadwal dan uji pemulihan database/media/kunci, staging terpisah, aksesibilitas menyeluruh, Safari/iOS fisik, serta uji beban.
11. Harga dan ketentuan final, materi berizin, domain/merek, SOP layanan, serta pilot 5–10 pasangan.

## Verifikasi tahap ini

- TypeScript, lint, dan build aplikasi berhasil.
- Tes backend/integrasi: isolasi, peran, konflik versi/persetujuan, pembayaran simulasi, token/kuota/RSVP, moderasi, media, production fail-closed.
- Tes HTTP asal request dengan host pengembangan dan penolakan lintas situs.
- Tes browser Chromium: tampilan desktop dan 390 px, pembuatan sampai publikasi, RSVP/ucapan tamu, alur review admin, dan validasi/persistensi impor CSV.
- Screenshot pemasaran, dashboard, editor, serta demo tema ditinjau.

Hasil tahap ini: **19 tes backend/HTTP (termasuk adapter Supabase dengan klien tiruan), 5 tes browser Chromium, lint, TypeScript, dan build lulus**. Pemeriksaan SQL pada database Supabase serta pembayaran tetap memerlukan layanan yang belum tersedia.

Status ini membedakan fungsi yang sudah dapat dicoba dari gerbang produksi yang belum terpenuhi. Backlog awal tetap menjadi acuan; item MVP tidak ditandai selesai hanya karena UI telah tersedia.
