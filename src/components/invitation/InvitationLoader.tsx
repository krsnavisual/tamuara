"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Heart, LoaderCircle } from "lucide-react";
import type { PublicInvitation } from "@/lib/types";
import InvitationView from "./InvitationView";

export default function InvitationLoader({
  slug,
  previewToken,
}: {
  slug?: string;
  previewToken?: string;
}) {
  const [data, setData] = useState<PublicInvitation | null>(null);
  const [guestToken, setGuestToken] = useState<string>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(window.location.search);
    const token = query.get("guest") || undefined;
    const endpoint = previewToken
      ? `/api/preview/${encodeURIComponent(previewToken)}`
      : `/api/public/${encodeURIComponent(slug || "")}${token ? `?guest=${encodeURIComponent(token)}` : ""}`;
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(
            response.status === 404
              ? "Undangan belum tersedia, sudah diarsipkan, atau tautannya telah berubah."
              : typeof result.error === "string"
                ? result.error
                : "Undangan belum dapat dimuat.",
          );
        setGuestToken(token);
        setError("");
        setData(result as PublicInvitation);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setError(
            e instanceof Error
              ? e.message
              : "Periksa koneksi internet Anda dan coba kembali.",
          );
      });
    return () => controller.abort();
  }, [slug, previewToken, attempt]);
  if (error)
    return (
      <main className="invitation-loading">
        <Heart size={28} strokeWidth={1} />
        <h1>Maaf, belum dapat dibuka.</h1>
        <p>{error}</p>
        <button
          onClick={() => {
            setError("");
            setData(null);
            setAttempt(attempt + 1);
          }}
        >
          Coba lagi
        </button>
        <Link href="/">Kembali ke Tamuara</Link>
      </main>
    );
  if (!data)
    return (
      <main className="invitation-loading" role="status">
        <LoaderCircle size={25} className="invitation-spin" />
        <p>Menyiapkan sebuah cerita indah…</p>
      </main>
    );
  return <InvitationView data={data} guestToken={guestToken} />;
}
