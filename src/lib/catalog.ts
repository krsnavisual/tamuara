import type { ThemeId, PlanId } from "./types";
export const THEMES: {
  id: ThemeId;
  name: string;
  description: string;
  color: string;
  category: string;
}[] = [
  {
    id: "classic",
    name: "A Timeless Affair",
    description: "Klasik, hangat, dan penuh makna.",
    color: "#7f4337",
    category: "Classic Elegant",
  },
  {
    id: "floral",
    name: "In Full Bloom",
    description: "Romansa yang tumbuh bersama.",
    color: "#53664c",
    category: "Floral Romantic",
  },
  {
    id: "minimal",
    name: "Simply, Us",
    description: "Ruang sederhana untuk cerita istimewa.",
    color: "#343b43",
    category: "Minimal Modern",
  },
];
export const PLANS: {
  id: PlanId;
  name: string;
  price: number;
  description: string;
  features: string[];
}[] = [
  {
    id: "mandiri",
    name: "Cerita Mandiri",
    price: 249000,
    description: "Sentuhan personal, dari tangan kalian.",
    features: [
      "3 tema pilihan",
      "Tautan personal untuk 500 penerima",
      "RSVP & ucapan tamu",
      "Galeri hingga 20 foto",
      "Amplop digital langsung ke pasangan",
    ],
  },
  {
    id: "assisted",
    name: "Dirangkai Bersama",
    price: 599000,
    description: "Kalian bercerita. Kami bantu merangkainya.",
    features: [
      "Semua fitur Cerita Mandiri",
      "Admin pendamping khusus",
      "Bantuan pengisian & penataan",
      "2 putaran revisi",
      "Pemeriksaan akhir bersama",
    ],
  },
];
export const money = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
export const dateLabel = (v: string) =>
  v
    ? new Intl.DateTimeFormat("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(new Date(v.length === 10 ? v + "T12:00:00+07:00" : v))
    : "Tanggal belum ditentukan";
