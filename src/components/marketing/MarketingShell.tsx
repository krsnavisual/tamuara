"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Heart, Menu, X } from "lucide-react";
import styles from "./marketing.module.css";

const navigation = [
  { href: "/tema", label: "Koleksi tema" },
  { href: "/#cara-kerja", label: "Cara kerja" },
  { href: "/harga", label: "Paket & harga" },
  { href: "/faq", label: "FAQ" },
];

export default function MarketingShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  return (
    <div className={styles.site}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link
            href="/"
            className={styles.logo}
            aria-label="Tamuara, beranda"
            onClick={() => setOpen(false)}
          >
            <span className={styles.logoMark} aria-hidden="true" />
            <span className={styles.logoWord} aria-hidden="true" />
          </Link>
          <nav
            aria-label="Navigasi utama"
            className={`${styles.nav} ${open ? styles.navOpen : ""}`}
          >
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <Link
              href="/masuk"
              className={styles.mobileLogin}
              onClick={() => setOpen(false)}
            >
              Masuk
            </Link>
          </nav>
          <div className={styles.headerActions}>
            <Link href="/masuk" className={styles.login}>
              Masuk
            </Link>
            <Link href="/daftar" className={styles.headerCta}>
              Mulai cerita <ArrowUpRight size={16} />
            </Link>
            <button
              className={styles.menuButton}
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={open ? "Tutup navigasi" : "Buka navigasi"}
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      <main id="konten-utama">{children}</main>
      <footer className={styles.footer}>
        <div className={styles.footerTop}>
          <div>
            <Link
              href="/"
              className={styles.logo}
              aria-label="Tamuara, beranda"
            >
              <span className={styles.logoWord} aria-hidden="true" />
            </Link>
            <p>Kisah kalian, dirayakan bersama.</p>
            <p className={styles.footerNote}>
              Undangan digital dengan ruang
              <br />
              untuk setiap cerita yang berarti.
            </p>
          </div>
          <div>
            <h3>Jelajahi</h3>
            <Link href="/tema">Koleksi tema</Link>
            <Link href="/harga">Paket & harga</Link>
            <Link href="/demo/classic">Lihat contoh undangan</Link>
          </div>
          <div>
            <h3>Kami di sini</h3>
            <Link href="/faq">Pertanyaan umum</Link>
            <Link href="/kontak">Hubungi Tamuara</Link>
            <Link href="/masuk">Masuk ke dashboard</Link>
          </div>
          <div className={styles.footerLove}>
            <Heart size={25} strokeWidth={1} />
            <p>
              Untuk cerita yang layak
              <br />
              dirayakan dengan indah.
            </p>
          </div>
        </div>
        <div className={styles.footerBottom}>
          <span>© {new Date().getFullYear()} Tamuara</span>
          <span>Dibuat dengan perhatian, untuk kalian.</span>
          <div>
            <Link href="/privasi">Privasi</Link>
            <Link href="/ketentuan">Ketentuan</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
