"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart, LoaderCircle } from "lucide-react";
import "./dashboard.css";
export function AuthForm({
  register = false,
  mode = "local",
}: {
  register?: boolean;
  mode?: "local" | "supabase";
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(data: Record<string, unknown>) {
    setBusy(true);
    setError("");
    setInfo("");
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await r.json();
      if (!r.ok) throw new Error(result.error || "Tidak dapat masuk.");
      if (result.requiresEmailConfirmation) {
        setInfo(
          "Akun dibuat. Periksa email kalian untuk mengonfirmasi akun, lalu masuk.",
        );
        return;
      }
      router.push(result.user?.role === "admin" ? "/admin" : "/app");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Terjadi kesalahan.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Link href="/" className="auth-brand">
          Tamuara<span>✦</span>
        </Link>
        <div>
          <p className="eyebrow">SEBUAH AWAL YANG INDAH</p>
          <h1>
            Setiap kisah cinta
            <br />
            layak <em>dirayakan.</em>
          </h1>
          <p>
            Rangkai undangan yang terasa seperti kalian.
            <br />
            Kami ada di setiap langkahnya.
          </p>
        </div>
        <small>Kisah kalian, dirayakan bersama.</small>
      </section>
      <section className="auth-form-wrap">
        <Link href="/" className="back-link">
          ← Kembali ke beranda
        </Link>
        <div className="auth-form">
          <div className="auth-flower">
            <Heart size={26} strokeWidth={1.3} />
          </div>
          <h2>{register ? "Mulai kisah kalian" : "Senang berjumpa lagi"}</h2>
          <p>
            {register
              ? "Buat akun untuk merangkai undangan pertama."
              : "Masuk untuk melanjutkan cerita istimewa kalian."}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              void submit({
                action: register ? "register" : "login",
                name: f.get("name"),
                email: f.get("email"),
                password: f.get("password"),
              });
            }}
          >
            {register && (
              <label>
                Nama kalian
                <input
                  required
                  name="name"
                  autoComplete="name"
                  placeholder="Ayu & Bima"
                  maxLength={100}
                />
              </label>
            )}
            <label>
              Email
              <input
                required
                type="email"
                name="email"
                autoComplete="email"
                placeholder="nama@email.com"
              />
            </label>
            <label>
              Kata sandi
              <input
                required
                type="password"
                name="password"
                minLength={8}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="Minimal 8 karakter"
              />
            </label>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            {info && (
              <p role="status" className="success-box">
                {info}
              </p>
            )}
            <button className="btn primary full" disabled={busy}>
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : register ? (
                "Buat akun"
              ) : (
                "Masuk"
              )}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="auth-switch">
            {register ? "Sudah punya akun?" : "Belum punya akun?"}{" "}
            <Link href={register ? "/masuk" : "/daftar"}>
              {register ? "Masuk" : "Mulai di sini"}
            </Link>
          </p>
          {!register && mode === "supabase" && (
            <p className="auth-switch">
              <Link href="/lupa-kata-sandi">Lupa kata sandi?</Link>
            </p>
          )}
          {mode === "local" && (
            <div className="demo-login">
              <span>JELAJAHI VERSI LOKAL</span>
              <div>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => submit({ action: "demo", role: "owner" })}
                >
                  Demo pasangan
                </button>
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => submit({ action: "demo", role: "admin" })}
                >
                  Demo admin
                </button>
              </div>
              <small>
                Akun demo berisi contoh undangan. Pembayaran hanya simulasi.
              </small>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
