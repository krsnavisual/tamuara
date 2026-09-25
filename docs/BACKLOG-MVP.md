# Backlog MVP Tamuara

**Versi:** 1 — 24 September 2026  
**Acuan:** [Rencana Pengembangan](RENCANA-PENGEMBANGAN.md)  
**Model layanan yang dipilih:** pasangan mengisi sendiri atau dibantu admin.

Backlog ini merupakan rancangan pelaksanaan. Stack, tiga tema pilot, paket, dan detail batas layanan masih berupa rekomendasi sebagaimana dijelaskan dalam dokumen utama.

## Cara memakai backlog

- **P0:** diperlukan untuk pilot berbayar yang menjalankan alur lengkap.
- **P1:** dikerjakan setelah pilot bila hasil penggunaan mendukung.
- **P2:** peluang pengembangan, belum masuk estimasi 8–12 minggu.
- Satu item dapat dipecah menjadi tugas desain, backend, frontend, dan verifikasi. Nomor di bawah menunjukkan pekerjaan, bukan jumlah hari.
- Setiap item selesai setelah hasilnya dapat diperiksa di staging, kriteria penerimaan terpenuhi, dan perubahan schema/konfigurasi terdokumentasi bila ada.
- Tes otomatis difokuskan pada akses pelanggan, publikasi, pembayaran, dan integritas RSVP. Tampilan diperiksa pada perangkat yang mewakili pengguna.

## Milestone A — Produk, desain, dan fondasi

### TAM-001 — Aturan produk dan paket · P0

**Hasil:** spesifikasi konten, aturan paket, dan matriks hak akses.  
**Dependensi:** tidak ada.  
**Penanggung jawab:** pemilik produk, dibantu developer.

Kriteria penerimaan:

- Definisi satu pembelian = satu website pernikahan dinyatakan jelas; banyak tautan tamu bukan pembelian terpisah.
- Paket mandiri dan bantuan mempunyai batas fitur, media, tamu, masa aktif, revisi, serta alur peningkatan yang tercatat.
- Konten wajib dan opsional, tenggat RSVP, masa hidup draf, dan retensi arsip ditentukan sebelum alur terkait dirilis.
- Harga bisa dikonfigurasi; harga final dan ketentuan layanan tersedia sebelum checkout live.

### TAM-002 — Wireframe dan identitas visual · P0

**Hasil:** alur layar pemasaran, editor, publikasi, tamu, RSVP, dan admin; token desain.  
**Dependensi:** TAM-001.  
**Penanggung jawab:** desain dan pemilik produk.

Kriteria penerimaan:

- Identitas mengikuti logo pilihan `brand/tamuara-logo.png`, tagline, serta palet blush/emas/cokelat.
- Layar memuat keadaan kosong, sedang menyimpan, berhasil, gagal, dan menunggu pelanggan.
- Tiga arah tema pilot dipilih; desain layar ponsel dan kebutuhan logo kecil ditinjau.

### TAM-003 — Proyek dan lingkungan pengembangan · P0

**Hasil:** aplikasi dasar, repositori, konfigurasi, CI, dan staging.  
**Dependensi:** TAM-001.  
**Penanggung jawab:** developer.

Kriteria penerimaan:

- Stack yang disetujui berjalan lokal dan di staging; dependency dikunci.
- Rahasia tidak masuk repositori atau bundle browser; staging dan production terpisah.
- Build, lint, dan typecheck berjalan di CI; konfigurasi serta langkah menjalankan proyek tercatat.

### TAM-004 — Akun dan keanggotaan undangan · P0

**Hasil:** login, pemulihan akses, profil, daftar undangan, membership.  
**Dependensi:** TAM-003.  
**Penanggung jawab:** developer.

Kriteria penerimaan:

- Pengguna hanya melihat undangan yang menjadi haknya.
- Pemilik dan admin yang ditugaskan memakai akun masing-masing; bantuan tidak membutuhkan kata sandi pelanggan.
- Pergantian atau pencabutan penugasan mengubah akses secara benar.
- Struktur mendukung lebih dari satu undangan per akun; UI undang akun pasangan kedua dapat menyusul.

### TAM-005 — Schema dan isolasi data · P0

**Hasil:** migrasi database, aturan akses, data contoh, dan pengujian akses.  
**Dependensi:** TAM-004.  
**Penanggung jawab:** developer.

Kriteria penerimaan:

- Tabel milik undangan terikat `invitation_id`; relasi tamu/acara lintas undangan ditolak.
- Akses API dan database diuji dengan dua pasangan serta admin berpenugasan berbeda.
- Daftar tamu, draf, transaksi, dan jawaban privat tidak dapat dibaca publik.
- Endpoint yang memakai akses server tetap memeriksa izin pengguna secara eksplisit.

## Milestone B — Editor dan undangan terbit

### TAM-006 — Unggahan dan pengelolaan media · P0

**Hasil:** unggah, pilih, urutkan, ganti, dan hapus media sesuai hak.  
**Dependensi:** TAM-005.

Kriteria penerimaan:

- Jenis, ukuran, dan kuota unggahan divalidasi server; foto dioptimalkan dan metadata lokasi dihapus.
- Media draf privat; media yang diterbitkan mempunyai akses yang sesuai.
- Aset yang masih dipakai publikasi aktif/histori tidak terhapus tanpa pengelolaan referensi.
- Pengguna A tidak dapat mengakses atau menimpa unggahan privat B melalui URL/request yang dimodifikasi.

### TAM-007 — Editor bertahap · P0

**Hasil:** formulir konten, simpan draf, validasi, dan indikator kelengkapan.  
**Dependensi:** TAM-002, TAM-005, TAM-006.

Kriteria penerimaan:

- Profil, acara, zona waktu, lokasi, foto, cerita, dan bagian opsional dapat diubah.
- Draf belum lengkap tetap dapat disimpan; pesan error menunjuk bagian yang perlu diperbaiki.
- Perubahan tidak hilang karena perpindahan layar tanpa pemberitahuan.
- Versi revisi mencegah penyuntingan pasangan dan admin saling menimpa diam-diam.

### TAM-008 — Renderer dan tiga tema pilot · P0

**Hasil:** komponen undangan bersama, pengaturan desain terkontrol, tiga tema.  
**Dependensi:** TAM-002, TAM-007.

Kriteria penerimaan:

- Minimal Modern, Floral Romantic, dan Classic Elegant, atau penggantinya yang disepakati, memakai schema konten yang sama.
- Ganti tema tidak menghapus data; bagian kosong tidak merusak layout.
- Nama panjang, satu/dua acara, galeri kosong, dan layar ponsel kecil tetap layak tampil.
- Musik hanya dimulai setelah interaksi yang diperlukan; halaman tetap berguna jika audio gagal.
- Versi tema tersimpan untuk publikasi; warna saja tidak dihitung sebagai tema terpisah.

### TAM-009 — Pratinjau dan publikasi versi · P0

**Hasil:** preview privat, slug, snapshot, terbitkan ulang, nonaktifkan.  
**Dependensi:** TAM-007, TAM-008; gerbang paket terhubung setelah TAM-014.

Kriteria penerimaan:

- Preview memakai token terbatas yang dapat dicabut dan tidak terindeks.
- Pemilik memeriksa serta menyetujui versi terkini; perubahan admin sesudahnya membutuhkan persetujuan baru.
- Draf baru tidak mengubah halaman aktif; publikasi menunjuk snapshot yang konsisten.
- Paket belum aktif tidak dapat menerbitkan di production; pembayaran sendiri tidak menerbitkan.
- Acara memakai ID stabil dan pengarsipan agar perubahan konten tidak merusak histori RSVP.

## Milestone C — Tamu dan interaksi

### TAM-010 — Daftar tamu, CSV, dan token · P0

**Hasil:** penerima individu/keluarga, grup, kuota, hak acara, impor, tautan.  
**Dependensi:** TAM-005, TAM-007.

Kriteria penerimaan:

- Kuota orang terpisah dari jumlah penerima; satu penerima dapat mengakses acara tertentu.
- Impor mempunyai pratinjau, kesalahan per baris, dan rekap hasil; nama sama tidak langsung digabung.
- Token acak mempunyai hash untuk validasi dan salinan terenkripsi yang hanya dapat dibuka server bagi pengelola berwenang. Menyalin ulang menghasilkan tautan yang sama; regenerasi mencabut tautan lama secara eksplisit. Nama pada query string tidak menjadi otorisasi.
- Token tidak masuk log, analytics, metadata sosial, atau respons daftar publik.

### TAM-011 — RSVP dan rekap · P0

**Hasil:** formulir RSVP per acara, pembaruan jawaban, ringkasan, ekspor.  
**Dependensi:** TAM-009, TAM-010.

Kriteria penerimaan:

- Tamu hanya merespons acara terbit yang diizinkan; token A tidak dapat mengubah jawaban B.
- Hadir mempunyai jumlah valid dalam kuota; tidak hadir bernilai nol; tenggat diperiksa server.
- Kirim ulang memperbarui record yang sama, termasuk pada request berulang.
- Rekap penerima dan jumlah orang cocok dengan data; ekspor hanya dapat dilakukan pihak berwenang dan menangani input teks dengan aman.

### TAM-012 — Ucapan dan amplop digital · P0

**Hasil:** ucapan termoderasi dan tujuan hadiah pasangan.  
**Dependensi:** TAM-007, TAM-009, TAM-010.

Kriteria penerimaan:

- Ucapan dapat disetujui, ditolak, dan disembunyikan; teks dirender aman dan pengiriman dibatasi.
- RSVP/catatan privat tidak menjadi ucapan publik secara otomatis.
- Rekening/QR hanya milik undangan terkait; perubahan draf oleh admin diperiksa pemilik saat publikasi.
- Tombol salin/QR bekerja dan tidak menampilkan klaim transfer berhasil.

### TAM-013 — Berbagi undangan · P0

**Hasil:** template pesan, salin tautan, buka WhatsApp, metadata sosial.  
**Dependensi:** TAM-009, TAM-010.

Kriteria penerimaan:

- Nama sapaan dan URL benar untuk penerima yang dipilih.
- Membuka aplikasi WhatsApp tidak otomatis mengubah status menjadi terkirim; penanda manual dijelaskan.
- Metadata memakai nama pasangan dan gambar umum; data token/penerima tidak bocor ke preview atau cache publik bersama.

## Milestone D — Penjualan dan layanan gabungan

### TAM-014 — Paket, pesanan, dan hak penggunaan · P0

**Hasil:** katalog paket, snapshot pesanan, entitlement, peningkatan bantuan.  
**Dependensi:** TAM-001, TAM-005.

Kriteria penerimaan:

- Harga, batas fitur, kuota, kedaluwarsa, dan jumlah revisi tersalin ke pesanan.
- Mengubah katalog tidak mengubah pembelian lama; mengubah tanggal acara tidak memperpanjang hak otomatis.
- Hak publikasi diperiksa server; peningkatan layanan mempertahankan konten dan histori pembelian.

### TAM-015 — Pembayaran paket · P0

**Hasil:** checkout, webhook, status, dan rekonsiliasi.  
**Dependensi:** TAM-014; akun merchant untuk pengaktifan live.

Kriteria penerimaan:

- Status diverifikasi server dengan pemeriksaan sumber, ID, nominal, dan pemetaan status provider.
- Callback palsu/duplikat/terlambat serta notifikasi tidak berurutan tidak menggandakan hak atau merusak status.
- Sukses/gagal/kedaluwarsa jelas bagi pengguna; pesanan dapat dipulihkan saat callback terlambat.
- Halaman redirect sukses tidak mengaktifkan fitur tanpa bukti server.
- Pembayaran paket terpisah dari informasi hadiah tamu.

### TAM-016 — Dashboard admin dan bantuan · P0

**Hasil:** antrean, penugasan, brief, editor bersama, revisi, audit.  
**Dependensi:** TAM-004, TAM-007, TAM-009, TAM-014.

Kriteria penerimaan:

- Admin pendamping mengakses undangan yang ditugaskan; akses dapat dicabut.
- Brief, kelengkapan materi, status pekerjaan, putaran revisi, dan hasil review dapat dilacak.
- Persetujuan menyebut versi draf; pemilik melakukan publikasi final.
- Aktivitas rekening, penugasan, perubahan hak paket, dan publikasi tercatat dengan pelaku/waktu.

### TAM-017 — Website pemasaran dan informasi layanan · P0

**Hasil:** landing, katalog/demo, harga, FAQ, kontak, privasi/ketentuan.  
**Dependensi:** TAM-002, TAM-008, TAM-014.

Kriteria penerimaan:

- Demo menggunakan data fiktif dan bisa dilihat tanpa akun.
- Isi paket, masa aktif, kuota, bantuan, revisi, serta alur pembuatan dijelaskan sebelum checkout.
- Semua CTA mengarah ke alur nyata; tampilan sesuai logo pilihan dan dapat digunakan di ponsel.

## Milestone E — Operasional, verifikasi, dan pilot

### TAM-018 — Siklus hidup, notifikasi, dan metrik · P0

**Hasil:** pengingat layanan, kedaluwarsa/arsip, ekspor/penghapusan, metrik dasar.  
**Dependensi:** TAM-009, TAM-011, TAM-015, TAM-016.

Kriteria penerimaan:

- Email akun dan perubahan penting dalam bantuan/pembayaran mempunyai pengiriman yang dapat ditelusuri tanpa memuat token sensitif pada log.
- Kedaluwarsa menutup akses publik sesuai ketentuan; periode ekspor/retensi dan penghapusan mempunyai proses operasional yang jelas.
- Konversi menuju publikasi dan waktu pengerjaan admin dapat diukur; data kontak/rekening dan URL bertoken tidak dikirim ke analytics.
- Pasangan mengetahui perubahan status dan tindakan berikutnya dari dashboard meskipun notifikasi email terlambat.

### TAM-019 — Verifikasi rilis dan pemulihan · P0

**Hasil:** laporan pengujian kritis, monitoring, backup, prosedur rilis/rollback.  
**Dependensi:** TAM-006 sampai TAM-018 yang terkait alur production.

Kriteria penerimaan:

- Isolasi pelanggan, draft/publikasi, pembayaran, RSVP, konflik editor, dan zona waktu lulus skenario dokumen utama.
- Tiga tema diuji di Chrome Android/Safari iOS, layar kecil, keyboard, serta koneksi yang dibatasi.
- Backup database dan media dipulihkan di lingkungan uji; kegagalan provider/storage memiliki catatan penanganan.
- Error monitoring menyamarkan data pribadi; alur deployment dan rollback dicoba.
- Domain, email pengirim, HTTPS, akun merchant live, konfigurasi production, dan materi dukungan siap sebelum transaksi nyata.

### TAM-020 — Pilot dan keputusan peluncuran · P0

**Hasil:** pilot 5–10 pasangan dan daftar perbaikan berdasarkan penggunaan.  
**Dependensi:** TAM-019.

Kriteria penerimaan:

- Peserta mewakili alur mandiri dan dibantu admin; keduanya menyelesaikan publikasi dengan bukti persetujuan.
- Tamu dapat merespons dan rekap akurat; tidak ada masalah kritis akses atau pembayaran yang masih terbuka.
- Waktu admin, kendala pengisian, pilihan tema, dan kontribusi pesanan tercatat.
- Harga/isi paket ditinjau memakai temuan; pemilik produk menetapkan kesiapan rilis dan prioritas berikutnya.

## Setelah pilot

| ID | Prioritas | Pekerjaan | Pemicu untuk dikerjakan |
| --- | --- | --- | --- |
| TAM-021 | P1 | Tambah katalog dari tiga menuju delapan tema | Permintaan/pilihan tema dan kapasitas produksi desain |
| TAM-022 | P1 | Undang akun pasangan kedua sebagai editor | Kebutuhan berbagi pengelolaan tanpa berbagi login |
| TAM-023 | P1 | Layanan desain khusus dengan penawaran dan revisi | SOP dan biaya pengerjaan sudah terukur |
| TAM-024 | P1 | Perpanjangan mandiri dan pengingat tambahan | Data kedaluwarsa serta permintaan pelanggan |
| TAM-025 | P2 | Reseller/mitra wedding organizer | Model komisi dan dukungan mitra tervalidasi |
| TAM-026 | P2 | Check-in QR dan pengaturan kursi | Ada kebutuhan operasional acara yang berbayar |
| TAM-027 | P2 | WhatsApp otomatis melalui integrasi resmi | Volume, izin pengiriman, biaya, serta manfaat jelas |
| TAM-028 | P2 | Domain pribadi, multi-bahasa, kontrol privasi lanjutan | Permintaan dan kesediaan membayar |
| TAM-029 | P2 | Penerimaan hadiah terintegrasi | Kebutuhan produk, provider, biaya, dan tanggung jawab operasional telah ditelaah tersendiri |

## Urutan mulai yang disarankan

1. Tetapkan aturan produk dan wireframe (TAM-001–002).
2. Siapkan proyek, akun, dan isolasi data (TAM-003–005).
3. Selesaikan satu alur draf → preview → publikasi dengan satu tema, lalu perluas menjadi tiga tema (TAM-006–009).
4. Tambahkan tamu, RSVP, ucapan/hadiah, dan berbagi (TAM-010–013).
5. Hubungkan paket, pembayaran, admin, dan pemasaran (TAM-014–017); persiapan provider dimulai sejak awal.
6. Lengkapi operasional, verifikasi, dan pilot (TAM-018–020).
