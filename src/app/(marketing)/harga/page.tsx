import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import Pricing from "@/components/marketing/Pricing";
import FaqList from "@/components/marketing/FaqList";
import styles from "@/components/marketing/marketing.module.css";

export const metadata: Metadata = { title: "Paket & Harga — Tamuara" };
export default function PricingPage() {
  return (
    <>
      <section className={styles.catalogPage}>
        <div className={styles.centerHeading}>
          <span className={styles.eyebrow}>PAKET & HARGA</span>
          <h1>
            Dengan cara kalian.
            <br />
            <em>Sepenuh perhatian.</em>
          </h1>
          <p>
            Pilih kebebasan merangkai sendiri, atau kenyamanan ditemani.
            <br />
            Satu paket untuk satu website undangan dan banyak tautan tamu.
          </p>
        </div>
        <Pricing />
        <div className={styles.simpleCallout}>
          <div>
            <h3>Belum tahu harus mulai dari mana?</h3>
            <p>Lihat contoh undangan dan rasakan pengalaman tamu kalian.</p>
          </div>
          <Link href="/demo/classic" className={styles.textLink}>
            Buka contoh undangan <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className={styles.faqSection}>
        <div>
          <span className={styles.eyebrow}>LEBIH JELAS SEBELUM MEMILIH</span>
          <h2>
            Tentang
            <br />
            <em>undangan kalian.</em>
          </h2>
        </div>
        <FaqList short />
      </section>
    </>
  );
}
