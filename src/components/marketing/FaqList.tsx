import { Plus } from "lucide-react";
import styles from "./marketing.module.css";

const questions = [
  {
    q: "Bisa membuat sendiri, atau harus dibantu admin?",
    a: "Keduanya bisa. Lewat Cerita Mandiri, kalian mengisi dan menata undangan sendiri. Dengan Dirangkai Bersama, admin membantu mengisi dan menata cerita kalian. Semua hasil tetap bisa kalian tinjau sebelum dipublikasikan.",
  },
  {
    q: "Satu undangan berarti satu tautan untuk satu tamu?",
    a: "Satu pembelian mencakup satu website undangan pernikahan. Di dalamnya kalian dapat membuat banyak tautan personal untuk penerima yang berbeda, sesuai batas paket. Nama tamu dan RSVP akan mengikuti tautan masing-masing.",
  },
  {
    q: "Bisa melihat hasilnya sebelum dipublikasikan?",
    a: "Bisa. Isi detail pasangan dan acara, lalu buka preview. Perubahan pada draft baru tampil di undangan publik setelah kalian memilih terbitkan atau menerbitkan ulang.",
  },
  {
    q: "Bagaimana cara kerja amplop digital?",
    a: "Kalian dapat menampilkan informasi rekening atau tujuan transfer milik pasangan. Tamu melakukan transfer langsung ke tujuan tersebut. Tamuara tidak menampung dana hadiah dan tidak menyatakan transfer berhasil secara otomatis.",
  },
  {
    q: "Apakah undangan bisa dibagikan lewat WhatsApp?",
    a: "Bisa. Buat tautan tamu, lalu salin atau buka pesan yang telah disiapkan melalui WhatsApp. Pengiriman tetap kalian lakukan sendiri. Membuka tombol berbagi tidak berarti pesan sudah terkirim atau dibaca.",
  },
  {
    q: "Apakah sekarang sudah bisa melakukan pembayaran?",
    a: "Versi saat ini adalah versi pengembangan. Kalian dapat mencoba alur membuat undangan dan simulasi paket. Pembayaran sungguhan dan layanan pendampingan komersial belum diaktifkan.",
  },
];

export default function FaqList({ short = false }: { short?: boolean }) {
  return (
    <div className={styles.faqList}>
      {(short ? questions.slice(0, 4) : questions).map((item) => (
        <details key={item.q} className={styles.faqItem}>
          <summary>
            {item.q}
            <Plus size={18} strokeWidth={1.4} />
          </summary>
          <p>{item.a}</p>
        </details>
      ))}
    </div>
  );
}
