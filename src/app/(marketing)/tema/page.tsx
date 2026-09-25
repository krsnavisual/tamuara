import type { Metadata } from "next";
import ThemeCollection from "@/components/marketing/ThemeCollection";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = { title: "Koleksi Tema — Tamuara" };
export default function ThemesPage() {
  return (
    <section className={styles.catalogPage}>
      <div className={styles.centerHeading}>
        <span className={styles.eyebrow}>KOLEKSI TEMA TAMUARA</span>
        <h1>
          Berbeda ceritanya.
          <br />
          <em>Istimewa undangannya.</em>
        </h1>
        <p>
          Tiga suasana pilihan. Temukan satu yang paling terasa seperti kalian,
          <br />
          lalu beri sentuhan cerita kalian sendiri.
        </p>
      </div>
      <ThemeCollection filter />
      <p className={styles.collectionNote}>
        Setiap tema dilengkapi detail acara, galeri, RSVP, ucapan, dan amplop
        digital.
      </p>
    </section>
  );
}
