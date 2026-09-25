import Link from "next/link";
export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 600,
        margin: "15vh auto",
        padding: 30,
        textAlign: "center",
      }}
    >
      <p style={{ letterSpacing: 4, color: "var(--rose)" }}>TAMUARA</p>
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontWeight: 400,
          fontSize: 42,
        }}
      >
        Halaman ini belum ditemukan.
      </h1>
      <p>Periksa kembali tautannya atau kembali ke beranda.</p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          padding: "12px 24px",
          background: "var(--rose)",
          color: "white",
          borderRadius: 8,
        }}
      >
        Kembali ke beranda
      </Link>
    </main>
  );
}
