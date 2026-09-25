"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Heart, LoaderCircle } from "lucide-react";
import "./dashboard.css";

export function PasswordRecovery({
  update = false,
  enabled = false,
}: {
  update?: boolean;
  enabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(form: FormData) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          update
            ? { action: "updatePassword", password: form.get("password") }
            : { action: "recover", email: form.get("email") },
        ),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Permintaan belum dapat diproses.");
      if (update) {
        setMessage("Kata sandi diperbarui. Silakan masuk kembali.");
        setTimeout(() => router.push("/masuk"), 1500);
      } else {
        setMessage(result.message || "Periksa email kalian untuk melanjutkan.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Terjadi kesalahan.");
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
          <p className="eyebrow">LANJUTKAN KISAH KALIAN</p>
          <h1>
            Kembali merangkai
            <br />
            <em>hari istimewa.</em>
          </h1>
          <p>Undangan kalian menunggu untuk dilanjutkan.</p>
        </div>
        <small>Kisah kalian, dirayakan bersama.</small>
      </section>
      <section className="auth-form-wrap">
        <Link href="/masuk" className="back-link">
          ← Kembali ke masuk
        </Link>
        <div className="auth-form">
          <div className="auth-flower">
            <Heart size={26} strokeWidth={1.3} />
          </div>
          <h2>{update ? "Atur kata sandi baru" : "Lupa kata sandi?"}</h2>
          <p>
            {update
              ? "Masukkan kata sandi baru untuk akun Tamuara kalian."
              : "Masukkan email akun kalian. Kami akan mengirim tautan pemulihan."}
          </p>
          {!enabled ? (
            <p className="inline-note">
              Pemulihan email tersedia setelah layanan Supabase diaktifkan.
            </p>
          ) : (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit(new FormData(event.currentTarget));
              }}
            >
              <label>
                {update ? "Kata sandi baru" : "Email"}
                <input
                  required
                  type={update ? "password" : "email"}
                  name={update ? "password" : "email"}
                  autoComplete={update ? "new-password" : "email"}
                  minLength={update ? 8 : undefined}
                  maxLength={update ? 128 : 254}
                  placeholder={update ? "Minimal 8 karakter" : "nama@email.com"}
                />
              </label>
              {error && (
                <p role="alert" className="error-box">
                  {error}
                </p>
              )}
              {message && (
                <p role="status" className="success-box">
                  {message}
                </p>
              )}
              <button className="btn primary full" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : update ? (
                  "Simpan kata sandi"
                ) : (
                  "Kirim tautan"
                )}
                <ArrowRight size={16} />
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
