import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, HeartHandshake, MessagesSquare } from "lucide-react";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = { title: "Hubungi Kami — Tamuara" };
export default function ContactPage() {
  return (
    <section className={styles.narrowPage}>
      <div className={styles.centerHeading}>
        <span className={styles.eyebrow}>MARI BICARA</span>
        <h1>
          Ada ruang untuk
          <br />
          <em>setiap pertanyaan.</em>
        </h1>
        <p>
          Mulai dari memilih tema sampai merapikan detail undangan,
          <br />
          temukan langkah selanjutnya di sini.
        </p>
      </div>
      <div className={styles.contactGrid}>
        <article>
          <MessagesSquare size={29} strokeWidth={1.2} />
          <h2>Bantuan undangan</h2>
          <p>
            Sudah membuat undangan? Buka menu bantuan pada dashboard untuk
            mencatat kebutuhan dan mengikuti statusnya.
          </p>
          <Link href="/app?section=bantuan" className={styles.textLink}>
            Buka bantuan <ArrowUpRight size={17} />
          </Link>
        </article>
        <article>
          <HeartHandshake size={30} strokeWidth={1.2} />
          <h2>Baru mengenal Tamuara?</h2>
          <p>
            Kenali cara kerja Tamuara dan pilihan layanan, lalu coba membuat
            draft undangan pertama kalian.
          </p>
          <Link href="/faq" className={styles.textLink}>
            Lihat pertanyaan umum <ArrowUpRight size={17} />
          </Link>
        </article>
      </div>
      <p className={styles.collectionNote}>
        Versi pengembangan: kanal bantuan dapat dicoba sebagai simulasi. Layanan
        komersial belum diaktifkan.
      </p>
    </section>
  );
}
