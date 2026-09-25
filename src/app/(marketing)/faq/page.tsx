import type { Metadata } from "next";
import Link from "next/link";
import FaqList from "@/components/marketing/FaqList";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = { title: "Pertanyaan Umum — Tamuara" };
export default function FaqPage() {
  return (
    <section className={styles.narrowPage}>
      <div className={styles.centerHeading}>
        <span className={styles.eyebrow}>KAMI BANTU MENJAWAB</span>
        <h1>
          Hal-hal kecil,
          <br />
          <em>yang ingin kalian tahu.</em>
        </h1>
        <p>Seputar membuat, mengelola, dan membagikan undangan Tamuara.</p>
      </div>
      <FaqList />
      <div className={styles.faqContact}>
        <h3>Masih ada yang ingin dibicarakan?</h3>
        <Link href="/kontak" className={styles.buttonOutline}>
          Hubungi Tamuara
        </Link>
      </div>
    </section>
  );
}
