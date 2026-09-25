import Link from "next/link";
import { ArrowUpRight, Check, HeartHandshake, PencilLine } from "lucide-react";
import { money, PLANS } from "@/lib/catalog";
import styles from "./marketing.module.css";

export default function Pricing() {
  return (
    <>
      <div className={styles.pricingGrid}>
        {PLANS.map((plan, index) => (
          <article
            key={plan.id}
            className={`${styles.priceCard} ${index === 1 ? styles.assistedPrice : ""}`}
          >
            <div className={styles.priceTop}>
              {index === 0 ? (
                <PencilLine size={24} strokeWidth={1.3} />
              ) : (
                <HeartHandshake size={26} strokeWidth={1.3} />
              )}
              <span>
                {index === 0
                  ? "DIRANGKAI OLEH KALIAN"
                  : "DENGAN SENTUHAN TIM KAMI"}
              </span>
            </div>
            <h3>{plan.name}</h3>
            <p>{plan.description}</p>
            <div className={styles.price}>
              {money(plan.price)}
              <span>/ undangan</span>
            </div>
            <Link
              className={
                index === 1 ? styles.buttonPrimary : styles.buttonOutline
              }
              href={`/daftar?paket=${plan.id}`}
            >
              Pilih {plan.name} <ArrowUpRight size={17} />
            </Link>
            <div className={styles.priceDivider} />
            <ul>
              {plan.features.map((feature) => (
                <li key={feature}>
                  <Check size={16} strokeWidth={1.7} />
                  {feature}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
      <p className={styles.priceDisclaimer}>
        Paket contoh untuk versi pengembangan. Belum menerima pembayaran nyata.
      </p>
    </>
  );
}
