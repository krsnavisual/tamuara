import type { Metadata } from "next";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = {
  title: "Privasi — Tamuara",
  robots: { index: false, follow: false },
};
export default function PrivacyPage() {
  return (
    <article className={styles.legalPage}>
      <span className={styles.eyebrow}>INFORMASI PLATFORM</span>
      <h1>Privasi kalian.</h1>
      <div className={styles.draftNotice}>
        Draf untuk versi pengembangan — belum menjadi kebijakan layanan
        komersial final.
      </div>
      <p>
        Halaman ini menjelaskan rancangan penggunaan data di Tamuara. Kebijakan
        final, identitas pengelola, kontak privasi, dan masa penyimpanan akan
        ditetapkan sebelum peluncuran komersial.
      </p>
      <h2>Data yang digunakan</h2>
      <p>
        Undangan dapat memuat nama pasangan, tanggal dan lokasi acara, cerita,
        foto, serta informasi hadiah yang kalian pilih. Pengelolaan tamu
        mencakup nama penerima, kuota tamu, respons kehadiran, dan ucapan.
      </p>
      <h2>Konten publik dan data pengelolaan</h2>
      <p>
        Konten yang kalian terbitkan dapat dilihat melalui tautan undangan.
        Daftar tamu, draft, dan informasi akun hanya ditujukan untuk pengelola
        yang memiliki akses. Tautan personal tamu perlu dibagikan dengan cermat
        karena penerima tautan tersebut dapat menggunakannya.
      </p>
      <h2>Pendampingan admin</h2>
      <p>
        Jika meminta bantuan, admin yang ditugaskan dapat mengakses informasi
        undangan yang diperlukan untuk menyelesaikan permintaan. Kalian meninjau
        hasil sebelum publikasi.
      </p>
      <h2>Mode pengembangan</h2>
      <p>
        Gunakan informasi contoh ketika mencoba versi ini. Pengalaman demo dapat
        menyimpan data pada browser yang digunakan. Menghapus data situs dari
        browser akan menghapus data demo setempat. Mode akun terhubung
        memerlukan konfigurasi layanan penyimpanan dan otorisasi sebelum
        digunakan untuk data nyata.
      </p>
      <h2>Penghapusan dan pertanyaan</h2>
      <p>
        Kontrol penghapusan serta proses permintaan data harus tersedia dan
        diuji sebelum peluncuran. Kanal kontak privasi resmi akan ditampilkan
        pada kebijakan final.
      </p>
    </article>
  );
}
