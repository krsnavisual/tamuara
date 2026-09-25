import type { InvitationContent, PublicInvitation, ThemeId } from "./types";

export const DEMO_COVER = "/images/wedding-cover.jpg";

export function demoContent(): InvitationContent {
  return {
    bride: {
      name: "Alya",
      fullName: "Alya Putri Maharani",
      parents: "Putri dari Bapak Hendra & Ibu Ratna",
    },
    groom: {
      name: "Raka",
      fullName: "Raka Aditya Pratama",
      parents: "Putra dari Bapak Budi & Ibu Dewi",
    },
    opening:
      "Di antara begitu banyak perjalanan, kami menemukan rumah dalam diri satu sama lain. Dengan penuh syukur dan bahagia, kami mengundang Anda menjadi bagian dari awal cerita kami.",
    closing:
      "Kehadiran dan doa Anda akan menjadi hadiah terindah untuk langkah pertama kami. Sampai bertemu di hari bahagia.",
    coverUrl: DEMO_COVER,
    gallery: ["/images/wedding-detail.jpg", "/images/wedding-cover.jpg"],
    events: [
      {
        id: "akad",
        title: "Akad Nikah",
        date: "2026-12-12",
        time: "08:00",
        endTime: "10:00",
        timezone: "Asia/Jakarta",
        location: "The Glasshouse",
        address: "Jl. Setiabudi No. 193, Bandung, Jawa Barat",
        mapUrl: "https://maps.google.com/?q=Bandung",
      },
      {
        id: "resepsi",
        title: "Resepsi Pernikahan",
        date: "2026-12-12",
        time: "11:00",
        endTime: "14:00",
        timezone: "Asia/Jakarta",
        location: "The Glasshouse",
        address: "Jl. Setiabudi No. 193, Bandung, Jawa Barat",
        mapUrl: "https://maps.google.com/?q=Bandung",
      },
    ],
    stories: [
      {
        id: "meet",
        title: "Pertemuan sederhana",
        date: "2019",
        body: "Dua orang asing, satu meja kecil di kedai kopi. Siapa sangka percakapan singkat itu menjadi awal cerita yang panjang.",
      },
      {
        id: "together",
        title: "Memilih bersama",
        date: "2023",
        body: "Dari perjalanan kecil hingga mimpi-mimpi besar, kami belajar bahwa pulang selalu terasa lebih indah ketika bersama.",
      },
      {
        id: "forever",
        title: "Satu langkah selamanya",
        date: "2026",
        body: "Di hadapan keluarga dan orang-orang terkasih, kami memilih untuk melanjutkan perjalanan ini dengan satu janji.",
      },
    ],
    gifts: [
      {
        id: "gift-bca",
        bank: "BCA · Rekening contoh",
        name: "Alya Putri Maharani",
        number: "0000000000",
      },
    ],
    showGifts: true,
    musicUrl: "",
    rsvpDeadline: "2026-12-05",
  };
}

export function demoInvitation(theme: ThemeId = "classic"): PublicInvitation {
  return {
    slug: "alya-dan-raka",
    theme,
    content: demoContent(),
    guest: {
      id: "demo-guest",
      name: "Bapak / Ibu / Saudara/i",
      quota: 2,
      eventIds: ["akad", "resepsi"],
    },
    rsvps: [],
    wishes: [
      {
        id: "wish-1",
        guestId: "sample-1",
        name: "Nadia & Keluarga",
        message:
          "Semoga setiap hari menjadi alasan baru untuk saling jatuh cinta. Bahagia selalu, Alya dan Raka!",
        status: "approved",
        createdAt: "2026-09-20T08:00:00Z",
      },
      {
        id: "wish-2",
        guestId: "sample-2",
        name: "Dimas",
        message:
          "Selamat menempuh perjalanan baru. Semoga rumah kalian selalu dipenuhi tawa dan kehangatan.",
        status: "approved",
        createdAt: "2026-09-19T08:00:00Z",
      },
    ],
    preview: true,
    mode: "demo",
  };
}
