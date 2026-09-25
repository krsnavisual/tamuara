import Link from "next/link";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Check,
  Heart,
  HeartHandshake,
  Mail,
  MoveUpRight,
  PencilLine,
  Smartphone,
  Sparkles,
  Users,
} from "lucide-react";
import { InvitationArtwork } from "@/components/marketing/InvitationArtwork";
import ThemeCollection from "@/components/marketing/ThemeCollection";
import Pricing from "@/components/marketing/Pricing";
import FaqList from "@/components/marketing/FaqList";
import styles from "@/components/marketing/marketing.module.css";

export default function HomePage() {
  return (
    <>
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <span className={styles.eyebrow}>
            <span /> UNDANGAN DIGITAL, SEPERSONAL KISAH KALIAN
          </span>
          <h1>
            Kisah kalian,
            <br />
            <em>dirayakan</em>
            <br />
            bersama<span className={styles.headingDot}>.</span>
          </h1>
          <p>
            Sebuah awal yang indah layak dibagikan dengan cara yang istimewa.
            Rangkai undangan pernikahan yang terasa seperti kalian.
          </p>
          <div className={styles.heroActions}>
            <Link href="/tema" className={styles.buttonPrimary}>
              Temukan tema kalian <ArrowUpRight size={18} />
            </Link>
            <Link href="/demo/classic" className={styles.textLink}>
              Lihat contoh <ArrowRight size={17} />
            </Link>
          </div>
          <div className={styles.heroNotes}>
            <span>
              <Check size={14} /> Buat sendiri atau dibantu
            </span>
            <span>
              <Check size={14} /> Preview sebelum terbit
            </span>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <span className={styles.visualCaption}>
            A LITTLE PREVIEW OF YOUR FOREVER
          </span>
          <div className={styles.heroCircle} />
          <div className={styles.photoPaper}>
            <div className={styles.heroPhoto} />
            <div className={styles.photoCaption}>
              the beginning of always <Heart size={11} />
            </div>
          </div>
          <div className={styles.invitationPaper}>
            <InvitationArtwork hero />
          </div>
          <div className={styles.floatingNote}>
            <span className={styles.noteIcon}>
              <Mail size={19} strokeWidth={1.2} />
            </span>
            <div>
              Untuk orang-orang tersayang.
              <small>Dari hati, sampai ke layar mereka.</small>
            </div>
          </div>
          <div className={styles.roundSeal}>
            <span>MADE WITH</span>
            <Heart size={22} strokeWidth={1} />
            <span>A LITTLE LOVE</span>
          </div>
          <span className={styles.visualIndex}>01 / A TIMELESS AFFAIR</span>
        </div>
        <a href="#koleksi" className={styles.scrollHint}>
          <ArrowDown size={14} /> CERITA INDAH DIMULAI DI SINI
        </a>
      </section>

      <section className={styles.featureStrip} aria-label="Keunggulan undangan">
        <div>
          <Smartphone size={19} strokeWidth={1.2} />
          <span>Indah di setiap layar</span>
        </div>
        <span className={styles.stripStar}>✦</span>
        <div>
          <Users size={19} strokeWidth={1.2} />
          <span>Tautan personal untuk tamu</span>
        </div>
        <span className={styles.stripStar}>✦</span>
        <div>
          <HeartHandshake size={21} strokeWidth={1.2} />
          <span>Dukungan sesuai kebutuhan</span>
        </div>
        <span className={styles.stripStar}>✦</span>
        <div>
          <Heart size={18} strokeWidth={1.2} />
          <span>Setiap detail punya makna</span>
        </div>
      </section>

      <section className={styles.section} id="koleksi">
        <div className={styles.sectionHeading}>
          <div>
            <span className={styles.eyebrow}>KOLEKSI PILIHAN</span>
            <h2>
              Temukan yang terasa
              <br />
              <em>seperti kalian.</em>
            </h2>
          </div>
          <div className={styles.headingAside}>
            <p>
              Klasik yang abadi, bunga yang romantis,
              <br />
              atau sederhana yang penuh arti.
            </p>
            <Link href="/tema" className={styles.textLink}>
              Jelajahi semua tema <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <ThemeCollection />
      </section>

      <section className={styles.storySection} id="cara-kerja">
        <div className={styles.storyIntro}>
          <span className={styles.eyebrow}>DARI CERITA MENJADI UNDANGAN</span>
          <h2>
            Tiga langkah kecil.
            <br />
            <em>Satu kabar bahagia.</em>
          </h2>
          <p>
            Nikmati prosesnya. Kami siapkan ruang agar kalian bisa fokus pada
            cerita dan orang-orang tersayang.
          </p>
          <Link href="/daftar" className={styles.textLink}>
            Mulai merangkai cerita <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className={styles.steps}>
          {[
            {
              no: "01",
              icon: Sparkles,
              title: "Pilih suasananya",
              text: "Temukan desain yang cocok dengan kepribadian dan momen pernikahan kalian.",
            },
            {
              no: "02",
              icon: PencilLine,
              title: "Isi dengan cerita kalian",
              text: "Tambahkan detail acara, foto, dan kisah perjalanan. Isi sendiri atau bersama admin.",
            },
            {
              no: "03",
              icon: Mail,
              title: "Bagikan kebahagiaannya",
              text: "Tinjau hasil, terbitkan undangan, lalu kirimkan tautan personal kepada para tamu.",
            },
          ].map((step) => (
            <div className={styles.step} key={step.no}>
              <span className={styles.stepNumber}>{step.no}</span>
              <div>
                <step.icon size={24} strokeWidth={1.1} />
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.serviceSection}>
        <div className={styles.serviceImage}>
          <div className={styles.serviceImageCaption}>
            <span>THE JOY IS IN THE DETAILS</span>
            <p>
              Kalian menikmati momennya.
              <br />
              Kami bantu setiap detailnya.
            </p>
          </div>
        </div>
        <div className={styles.serviceContent}>
          <span className={styles.eyebrow}>SESUAI CARA KALIAN</span>
          <h2>
            Dirangkai sendiri,
            <br />
            atau <em>bersama kami.</em>
          </h2>
          <p>
            Setiap pasangan punya waktu dan kebutuhan yang berbeda. Pilih cara
            yang membuat kalian paling nyaman.
          </p>
          <div className={styles.serviceOption}>
            <PencilLine size={23} strokeWidth={1.2} />
            <div>
              <h3>Sentuhan pribadi kalian</h3>
              <p>
                Pilih tema, tulis kisah, atur detail. Editor yang terarah
                membantu kalian menikmati setiap langkah.
              </p>
            </div>
          </div>
          <div className={styles.serviceOption}>
            <HeartHandshake size={26} strokeWidth={1.2} />
            <div>
              <h3>Ada yang menemani</h3>
              <p>
                Berikan bahan dan cerita kalian. Admin membantu merangkai, lalu
                kalian meninjau sebelum terbit.
              </p>
            </div>
          </div>
          <Link href="/harga" className={styles.textLink}>
            Temukan paket yang pas <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>

      <section className={`${styles.section} ${styles.pricingSection}`}>
        <div className={styles.centerHeading}>
          <span className={styles.eyebrow}>
            SATU UNDANGAN, BANYAK KEBAHAGIAAN
          </span>
          <h2>
            Ruang untuk cerita.
            <br />
            <em>Pilihan untuk kalian.</em>
          </h2>
          <p>
            Satu website pernikahan, dengan tautan personal untuk para tamu.
          </p>
        </div>
        <Pricing />
      </section>

      <section className={styles.faqSection}>
        <div>
          <span className={styles.eyebrow}>SEBELUM MEMULAI</span>
          <h2>
            Mungkin ini
            <br />
            <em>yang kalian pikirkan.</em>
          </h2>
          <Link href="/faq" className={styles.textLink}>
            Semua pertanyaan <ArrowUpRight size={17} />
          </Link>
        </div>
        <FaqList short />
      </section>

      <section className={styles.closing}>
        <Heart size={28} strokeWidth={1} />
        <span className={styles.eyebrow}>SETIAP KISAH PUNYA AWAL</span>
        <h2>
          Mari buat milik kalian
          <br />
          <em>terasa istimewa.</em>
        </h2>
        <Link href="/daftar" className={styles.buttonPrimary}>
          Mulai cerita kalian <MoveUpRight size={18} />
        </Link>
        <p>Buat draft dan lihat bagaimana cerita kalian menjadi hidup.</p>
      </section>
    </>
  );
}
