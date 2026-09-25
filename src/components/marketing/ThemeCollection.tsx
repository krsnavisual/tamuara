"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, Check } from "lucide-react";
import { THEMES } from "@/lib/catalog";
import { InvitationArtwork } from "./InvitationArtwork";
import styles from "./marketing.module.css";

export default function ThemeCollection({
  filter = false,
}: {
  filter?: boolean;
}) {
  const [category, setCategory] = useState("Semua tema");
  const categories = ["Semua tema", ...THEMES.map((theme) => theme.category)];
  return (
    <>
      {filter && (
        <div
          className={styles.filters}
          role="group"
          aria-label="Filter kategori tema"
        >
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setCategory(item)}
              aria-pressed={category === item}
              className={category === item ? styles.filterActive : ""}
            >
              {category === item && <Check size={13} />}
              {item}
            </button>
          ))}
        </div>
      )}
      <div className={styles.themeGrid}>
        {THEMES.filter(
          (theme) => category === "Semua tema" || theme.category === category,
        ).map((theme, index) => (
          <article className={styles.themeCard} key={theme.id}>
            <Link
              href={`/demo/${theme.id}`}
              className={`${styles.themeStage} ${styles[`${theme.id}Stage`]}`}
              aria-label={`Lihat demo ${theme.name}`}
            >
              <span className={styles.themeNumber}>0{index + 1}</span>
              <InvitationArtwork theme={theme.id} />
              <span className={styles.previewLabel}>
                Lihat undangan <ArrowUpRight size={15} />
              </span>
            </Link>
            <div className={styles.themeInfo}>
              <div>
                <span className={styles.smallLabel}>{theme.category}</span>
                <h3>
                  <Link href={`/demo/${theme.id}`}>{theme.name}</Link>
                </h3>
                <p>{theme.description}</p>
              </div>
              <Link
                href={`/daftar?tema=${theme.id}`}
                className={styles.circleLink}
                aria-label={`Pilih tema ${theme.name}`}
              >
                <ArrowUpRight size={21} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
