import { ArrowUpRight, Flower2, Heart, Leaf } from "lucide-react";
import styles from "./marketing.module.css";

export function InvitationArtwork({
  theme = "classic",
  hero = false,
}: {
  theme?: string;
  hero?: boolean;
}) {
  const label =
    theme === "floral" ? "floral" : theme === "minimal" ? "minimal" : "classic";
  return (
    <div
      className={`${styles.invitationArtwork} ${styles[label]} ${hero ? styles.heroArtwork : ""}`}
      aria-label={`Contoh desain undangan ${label}`}
    >
      <div className={styles.artBorder} />
      {label === "classic" && (
        <>
          <div className={styles.artArch} />
          <Leaf className={styles.artLeafOne} size={66} strokeWidth={0.6} />
          <Leaf className={styles.artLeafTwo} size={55} strokeWidth={0.6} />
        </>
      )}
      {label === "floral" && (
        <>
          <Flower2 className={styles.flowerOne} strokeWidth={0.7} />
          <Leaf className={styles.artLeafOne} size={76} strokeWidth={0.6} />
          <Flower2 className={styles.flowerTwo} strokeWidth={0.7} />
        </>
      )}
      {label === "minimal" && <div className={styles.minimalPhoto} />}
      <span className={styles.artEyebrow}>THE WEDDING OF</span>
      <div className={styles.artNames}>
        Nadira<span>&</span>Ardan
      </div>
      <span className={styles.artDate}>24 . 12 . 2026</span>
      <div className={styles.artRule} />
      <p className={styles.artCopy}>Dua cerita, satu perjalanan.</p>
      <span className={styles.artHeart}>
        <Heart size={16} strokeWidth={1} />
      </span>
      {hero && (
        <div className={styles.artOpen}>
          Buka undangan <ArrowUpRight size={12} />
        </div>
      )}
    </div>
  );
}
