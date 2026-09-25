import type { Metadata } from "next";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Ketentuan — Tamuara",
  robots: { index: false, follow: false },
};
export default function TermsPage() {
  return (
    <article className={styles.legalPage}>
      <span className={styles.eyebrow}>INFORMASI PLATFORM</span>
      <h1>Ketentuan penggunaan.</h1>
      <div className={styles.draftNotice}>
        Draf untuk versi pengembangan — belum menjadi ketentuan layanan
        komersial final.
      </div>
      <p>
        Tamuara adalah platform untuk merangkai dan mengelola undangan
        pernikahan digital. Saat ini fitur dapat dicoba untuk mengevaluasi
        pengalaman pembuatan undangan.
      </p>
      <h2>Paket dan pembayaran</h2>
      <p>
        Harga yang ditampilkan merupakan contoh rancangan paket. Versi
        pengembangan belum menerima pembayaran nyata. Satu paket dirancang untuk
        satu website undangan dengan tautan personal bagi para penerima sesuai
        batas paket.
      </p>
      <h2>Konten undangan</h2>
      <p>
        Pasangan bertanggung jawab memastikan ketepatan detail acara serta
        memiliki izin menggunakan foto, musik, dan konten yang ditambahkan.
        Periksa kembali konten sebelum menerbitkan undangan.
      </p>
      <h2>Layanan pendampingan</h2>
      <p>
        Rancangan layanan bantuan mencakup pengisian, penataan, dan revisi
        sesuai paket. Pengerjaan mengikuti bahan yang diberikan pasangan. Jadwal
        layanan dan batas revisi final akan dijelaskan sebelum pembelian
        diaktifkan.
      </p>
      <h2>Amplop digital</h2>
      <p>
        Informasi hadiah mengarahkan tamu untuk melakukan transfer langsung
        kepada pasangan. Tamuara tidak menampung hadiah, dan informasi rekening
        atau salinan tujuan transfer bukan bukti keberhasilan pembayaran.
      </p>
      <h2>Masa aktif dan pembatalan</h2>
      <p>
        Masa aktif, perpanjangan, pembatalan, pengembalian dana, serta ketentuan
        setelah acara akan ditetapkan sebelum peluncuran komersial dan
        ditampilkan dengan jelas pada saat pemilihan paket.
      </p>
      <h2>Penggunaan versi pengembangan</h2>
      <p>
        Gunakan data contoh. Fitur dan penyimpanan dapat berubah selama
        pengembangan. Publikasi layanan untuk undangan nyata memerlukan
        konfigurasi produksi dan pemeriksaan kesiapan terlebih dahulu.
      </p>
    </article>
  );
}
