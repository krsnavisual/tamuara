import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Tamuara — Kisah kalian, dirayakan bersama.",
    template: "%s · Tamuara",
  },
  description:
    "Undangan pernikahan yang personal. Rangkai sendiri atau bersama admin Tamuara.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
