"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUpRight,
  CalendarDays,
  Check,
  CheckCircle2,
  Copy,
  Heart,
  LoaderCircle,
  Mail,
  MapPin,
  Music2,
  Pause,
  Send,
  Sparkles,
} from "lucide-react";
import type { PublicInvitation, WeddingEvent } from "@/lib/types";
import "./invitation.css";

const zoneLabel = {
  "Asia/Jakarta": "WIB",
  "Asia/Makassar": "WITA",
  "Asia/Jayapura": "WIT",
};
const zoneOffset = {
  "Asia/Jakarta": "+07:00",
  "Asia/Makassar": "+08:00",
  "Asia/Jayapura": "+09:00",
};

function safeUrl(value: string, local = false) {
  if (local && value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}
function dayLabel(date: string, long = false) {
  if (!date || Number.isNaN(Date.parse(date))) return "Tanggal akan diumumkan";
  return new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(long ? ({ weekday: "long" } as const) : {}),
    timeZone: "UTC",
  }).format(new Date(date + "T12:00:00Z"));
}
function eventDate(event: WeddingEvent, end = false) {
  return new Date(
    `${event.date}T${end ? event.endTime || event.time : event.time}:00${zoneOffset[event.timezone]}`,
  );
}
function icsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\n|\r/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
function downloadCalendar(event: WeddingEvent, couple: string) {
  const format = (date: Date) =>
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const start = eventDate(event);
  let end = eventDate(event, true);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()))
    return;
  if (end <= start) end = new Date(start.getTime() + 60 * 60 * 1000);
  const value = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tamuara//Undangan Pernikahan//ID",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${icsText(event.id)}-${start.getTime()}@tamuara`,
    `DTSTAMP:${format(new Date())}`,
    `DTSTART:${format(start)}`,
    `DTEND:${format(end)}`,
    `SUMMARY:${icsText(`${event.title} · ${couple}`)}`,
    `LOCATION:${icsText(`${event.location}, ${event.address}`)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(
    new Blob([value], { type: "text/calendar;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "undangan-pernikahan.ics";
  link.click();
  URL.revokeObjectURL(url);
}

function Countdown({ event }: { event?: WeddingEvent }) {
  const [seconds, setSeconds] = useState<number | null>(null);
  useEffect(() => {
    if (!event) return;
    const tick = () =>
      setSeconds(
        Math.max(
          0,
          Math.floor((eventDate(event).getTime() - Date.now()) / 1000),
        ),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [event]);
  if (!event) return null;
  const values =
    seconds === null || !Number.isFinite(seconds)
      ? ["—", "—", "—", "—"]
      : [
          Math.floor(seconds / 86400),
          Math.floor((seconds % 86400) / 3600),
          Math.floor((seconds % 3600) / 60),
          seconds % 60,
        ];
  return (
    <div
      className="invitation-countdown"
      aria-label="Hitung mundur hari pernikahan"
    >
      {values.map((value, i) => (
        <div key={i}>
          <strong>{String(value).padStart(2, "0")}</strong>
          <span>{["Hari", "Jam", "Menit", "Detik"][i]}</span>
        </div>
      ))}
    </div>
  );
}

function Ornament() {
  return (
    <div className="invitation-ornament" aria-hidden="true">
      <span />
      <Heart size={16} strokeWidth={1.2} />
      <span />
    </div>
  );
}

export interface InvitationViewProps {
  data: PublicInvitation;
  guestToken?: string;
  onRefresh?: () => void;
  compact?: boolean;
  demo?: boolean;
}

export default function InvitationView({
  data,
  guestToken,
  onRefresh,
  compact = false,
  demo = false,
}: InvitationViewProps) {
  const [responseData, setCurrent] = useState<PublicInvitation | null>(null);
  const current = data.preview ? data : responseData || data;
  const [now, setNow] = useState(0);
  const [opened, setOpened] = useState(compact);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [copied, setCopied] = useState("");
  const [playing, setPlaying] = useState(false);
  const [wish, setWish] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const articleRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const initial = setTimeout(tick, 0);
    const timer = setInterval(tick, 60000);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
    };
  }, []);
  const { content, guest, preview } = current;
  const couple = `${content.bride.name || "Mempelai"} & ${content.groom.name || "Mempelai"}`;
  const cover = safeUrl(content.coverUrl, true);
  const music = safeUrl(content.musicUrl, true);
  const canRespond = Boolean(guest && guestToken && !preview);
  const visibleEvents = guest
    ? content.events.filter((event) => guest.eventIds.includes(event.id))
    : content.events;
  const deadlinePassed = Boolean(
    content.rsvpDeadline &&
    now >
      new Date(
        `${content.rsvpDeadline}T23:59:59${zoneOffset[visibleEvents[0]?.timezone || "Asia/Jakarta"]}`,
      ).getTime(),
  );

  async function submit(
    action: string,
    payload: Record<string, unknown>,
    key: string,
  ) {
    if (!canRespond || busy) return;
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/public/${encodeURIComponent(current.slug)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, guestToken, ...payload }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "Perubahan belum tersimpan. Silakan coba kembali.",
        );
      setCurrent(result as PublicInvitation);
      setNotice(
        action === "wish"
          ? "Terima kasih. Ucapan Anda akan tampil setelah disetujui pasangan."
          : "Terima kasih, konfirmasi kehadiran Anda sudah tersimpan.",
      );
      if (action === "wish") setWish("");
      onRefresh?.();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Koneksi terputus. Silakan coba kembali.",
      );
    } finally {
      setBusy("");
    }
  }
  async function copyNumber(number: string, id: string) {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(id);
      setTimeout(() => setCopied(""), 2500);
    } catch {
      setError(
        "Nomor belum tersalin. Anda dapat menyalin nomor rekening secara manual.",
      );
    }
  }
  function openInvitation() {
    setOpened(true);
    requestAnimationFrame(() => articleRef.current?.focus());
  }
  async function toggleMusic() {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setError("Musik belum dapat diputar. Silakan coba kembali.");
    }
  }

  return (
    <div
      className={`invitation-root invitation-theme-${current.theme}${compact ? " invitation-compact" : ""}`}
    >
      {!opened && (
        <section className="invitation-cover" aria-label="Sampul undangan">
          {cover && (
            <img
              className="invitation-cover-image"
              src={cover}
              alt=""
              fetchPriority="high"
            />
          )}
          <div className="invitation-cover-shade" />
          <div className="invitation-cover-content">
            <span className="invitation-eyebrow">
              SEBUAH JANJI, SEBUAH PERJALANAN
            </span>
            <div className="invitation-cover-names">
              <span>{content.bride.name || "Mempelai"}</span>
              <i>&</i>
              <span>{content.groom.name || "Mempelai"}</span>
            </div>
            <p className="invitation-cover-date">
              {content.events[0]
                ? dayLabel(content.events[0].date)
                : "Hari bahagia kami"}
            </p>
            <div className="invitation-cover-recipient">
              <small>Kepada yang terkasih,</small>
              <strong>{guest?.name || "Bapak / Ibu / Saudara/i"}</strong>
            </div>
            <button
              className="invitation-button invitation-open"
              onClick={openInvitation}
            >
              <Mail size={16} /> Buka Undangan
            </button>
            <p className="invitation-cover-foot">
              {demo
                ? "Pratinjau tema · Seluruh data merupakan contoh"
                : "Dengan bahagia, kami mengundang Anda"}
            </p>
          </div>
        </section>
      )}
      <div
        className={`invitation-layout${opened ? " is-open" : ""}`}
        inert={!opened}
      >
        <aside className="invitation-desktop-portrait" aria-hidden="true">
          {cover && <img src={cover} alt="" />}
          <div className="invitation-portrait-shade" />
          <div className="invitation-desktop-title">
            <span className="invitation-eyebrow">MERAYAKAN CINTA</span>
            <h1>
              {content.bride.name}
              <i>&</i>
              {content.groom.name}
            </h1>
            <p>{content.events[0] && dayLabel(content.events[0].date)}</p>
          </div>
          <span className="invitation-desktop-signature">
            Kisah kami, dirayakan bersama.
          </span>
        </aside>
        <main className="invitation-paper" ref={articleRef} tabIndex={-1}>
          <h1 className="invitation-sr-only">Undangan pernikahan {couple}</h1>
          {preview && (
            <div className="invitation-preview">
              <Sparkles size={14} />{" "}
              {demo
                ? "Contoh tema — data dan rekening ilustrasi"
                : "Pratinjau pribadi — perubahan belum dipublikasikan"}
            </div>
          )}
          <header className="invitation-hero">
            <span className="invitation-eyebrow">UNDANGAN PERNIKAHAN</span>
            <div className="invitation-monogram" aria-hidden="true">
              {content.bride.name.slice(0, 1) || "A"}
              <span>&</span>
              {content.groom.name.slice(0, 1) || "R"}
            </div>
            <h2>
              {content.bride.name || "Mempelai"} <em>&</em>{" "}
              {content.groom.name || "Mempelai"}
            </h2>
            <p>{content.events[0] && dayLabel(content.events[0].date, true)}</p>
            <Ornament />
            <p className="invitation-opening">{content.opening}</p>
            <a
              href="#mempelai"
              className="invitation-scroll"
              aria-label="Lihat mempelai"
            >
              <ArrowDown size={18} />
            </a>
          </header>
          <section
            className="invitation-section invitation-couple"
            id="mempelai"
          >
            <span className="invitation-eyebrow">DUA HATI, SATU TUJUAN</span>
            <h2>Mempelai</h2>
            <div className="invitation-person">
              <span className="invitation-person-initial">
                {content.bride.name.slice(0, 1)}
              </span>
              <h3>{content.bride.fullName || content.bride.name}</h3>
              <p>{content.bride.parents}</p>
            </div>
            <i className="invitation-couple-and">&</i>
            <div className="invitation-person">
              <span className="invitation-person-initial">
                {content.groom.name.slice(0, 1)}
              </span>
              <h3>{content.groom.fullName || content.groom.name}</h3>
              <p>{content.groom.parents}</p>
            </div>
          </section>
          <section className="invitation-section invitation-events" id="acara">
            <span className="invitation-eyebrow">CATAT HARI BAHAGIA KAMI</span>
            <h2>Waktu & tempat</h2>
            <Countdown event={visibleEvents[0]} />
            <div className="invitation-event-list">
              {visibleEvents.length ? (
                visibleEvents.map((event) => (
                  <article className="invitation-event" key={event.id}>
                    <CalendarDays size={23} strokeWidth={1} />
                    <h3>{event.title}</h3>
                    <p className="invitation-event-date">
                      {dayLabel(event.date, true)}
                    </p>
                    <p>
                      {event.time.replace(":", ".")} –{" "}
                      {event.endTime
                        ? event.endTime.replace(":", ".")
                        : "selesai"}{" "}
                      {zoneLabel[event.timezone]}
                    </p>
                    <div className="invitation-event-rule" />
                    <h4>{event.location}</h4>
                    <p className="invitation-address">{event.address}</p>
                    <div className="invitation-event-actions">
                      {safeUrl(event.mapUrl) && (
                        <a
                          href={safeUrl(event.mapUrl)}
                          className="invitation-button"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MapPin size={14} /> Buka Peta
                        </a>
                      )}
                      <button
                        className="invitation-text-button"
                        onClick={() => downloadCalendar(event, couple)}
                      >
                        <CalendarDays size={14} /> Simpan Tanggal
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p>Informasi acara akan segera tersedia.</p>
              )}
            </div>
          </section>
          {content.stories.length > 0 && (
            <section
              className="invitation-section invitation-story"
              id="cerita"
            >
              <span className="invitation-eyebrow">
                SETIAP CINTA PUNYA CERITA
              </span>
              <h2>Begini awalnya</h2>
              <div className="invitation-story-list">
                {content.stories.map((story, i) => (
                  <article key={story.id}>
                    <span className="invitation-story-number">0{i + 1}</span>
                    <div>
                      <span className="invitation-story-date">
                        {story.date}
                      </span>
                      <h3>{story.title}</h3>
                      <p>{story.body}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
          {content.gallery.some((url) => safeUrl(url, true)) && (
            <section
              className="invitation-section invitation-gallery-section"
              id="galeri"
            >
              <span className="invitation-eyebrow">MOMEN YANG KAMI SIMPAN</span>
              <h2>Sepotong bahagia</h2>
              <div className="invitation-gallery">
                {content.gallery
                  .filter((url) => safeUrl(url, true))
                  .map((url, i) => (
                    <a
                      href={safeUrl(url, true)}
                      key={`${url}-${i}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Buka foto kenangan ${i + 1}`}
                    >
                      <img
                        src={safeUrl(url, true)}
                        alt={`Foto kenangan ${couple}, ${i + 1}`}
                        loading="lazy"
                      />
                      <span>
                        <ArrowUpRight size={16} />
                      </span>
                    </a>
                  ))}
              </div>
            </section>
          )}
          <section className="invitation-section invitation-rsvp" id="rsvp">
            <span className="invitation-eyebrow">KEHADIRAN ANDA BERARTI</span>
            <h2>Rayakan bersama</h2>
            <p>Kami menantikan kehadiran dan doa baik Anda.</p>
            {content.rsvpDeadline && (
              <p className="invitation-deadline">
                Konfirmasi paling lambat {dayLabel(content.rsvpDeadline)}.
              </p>
            )}
            {preview ? (
              <div className="invitation-info">
                <Mail size={18} />
                <p>
                  Formulir RSVP tersedia untuk tamu pada undangan yang sudah
                  dipublikasikan.
                </p>
              </div>
            ) : !canRespond ? (
              <div className="invitation-info">
                <Mail size={18} />
                <p>
                  Gunakan tautan personal dari pasangan untuk mengonfirmasi
                  kehadiran dan mengirim ucapan.
                </p>
              </div>
            ) : deadlinePassed ? (
              <div className="invitation-info">
                <p>
                  Periode konfirmasi kehadiran sudah berakhir. Silakan hubungi
                  pasangan untuk perubahan.
                </p>
              </div>
            ) : (
              <div className="invitation-rsvp-forms">
                <div className="invitation-guest-greeting">
                  Untuk <strong>{guest?.name}</strong>
                  <span>
                    Undangan berlaku untuk maksimal {guest?.quota} orang.
                  </span>
                </div>
                {visibleEvents.map((event) => {
                  const response = current.rsvps.find(
                    (item) =>
                      item.eventId === event.id && item.guestId === guest?.id,
                  );
                  return (
                    <form
                      className="invitation-rsvp-form"
                      key={`${event.id}-${response?.updatedAt || "new"}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        const status = String(form.get("status"));
                        submit(
                          "rsvp",
                          {
                            eventId: event.id,
                            status,
                            count:
                              status === "attending"
                                ? Number(form.get("count"))
                                : 0,
                          },
                          event.id,
                        );
                      }}
                    >
                      <h3>{event.title}</h3>
                      {response && (
                        <p className="invitation-saved">
                          <CheckCircle2 size={14} />{" "}
                          {response.status === "attending"
                            ? `Akan hadir · ${response.count} orang`
                            : "Berhalangan hadir"}{" "}
                          — dapat diperbarui
                        </p>
                      )}
                      <fieldset disabled={Boolean(busy)}>
                        <legend className="invitation-sr-only">
                          Konfirmasi untuk {event.title}
                        </legend>
                        <div className="invitation-radio-group">
                          <label>
                            <input
                              type="radio"
                              name="status"
                              value="attending"
                              defaultChecked={
                                !response || response.status === "attending"
                              }
                              required
                            />{" "}
                            Dengan senang hati
                          </label>
                          <label>
                            <input
                              type="radio"
                              name="status"
                              value="declined"
                              defaultChecked={response?.status === "declined"}
                            />{" "}
                            Maaf, belum bisa hadir
                          </label>
                        </div>
                        <label className="invitation-field">
                          Jumlah orang jika hadir
                          <select
                            name="count"
                            defaultValue={response?.count || 1}
                          >
                            {Array.from(
                              { length: guest?.quota || 1 },
                              (_, i) => (
                                <option key={i} value={i + 1}>
                                  {i + 1} orang
                                </option>
                              ),
                            )}
                          </select>
                        </label>
                        <button className="invitation-button" type="submit">
                          {busy === event.id ? (
                            <LoaderCircle
                              size={15}
                              className="invitation-spin"
                            />
                          ) : (
                            <Check size={15} />
                          )}
                          {busy === event.id
                            ? "Menyimpan…"
                            : response
                              ? "Perbarui Konfirmasi"
                              : "Kirim Konfirmasi"}
                        </button>
                      </fieldset>
                    </form>
                  );
                })}
              </div>
            )}
          </section>
          {content.showGifts && content.gifts.length > 0 && (
            <section
              className="invitation-section invitation-gifts"
              id="hadiah"
            >
              <Heart size={24} strokeWidth={1} />
              <h2>Tanda kasih</h2>
              <p>
                Doa dan kehadiran Anda sudah lebih dari cukup. Jika ingin
                berbagi tanda kasih, Anda dapat mengirimkannya langsung kepada
                kami.
              </p>
              {demo && (
                <div className="invitation-info">
                  Rekening berikut hanya contoh. Jangan melakukan transfer.
                </div>
              )}
              <div className="invitation-gift-list">
                {content.gifts.map((gift) => (
                  <article className="invitation-gift" key={gift.id}>
                    <span className="invitation-gift-bank">{gift.bank}</span>
                    <strong>{gift.number}</strong>
                    <p>a.n. {gift.name}</p>
                    <button
                      className="invitation-text-button"
                      disabled={preview}
                      onClick={() => copyNumber(gift.number, gift.id)}
                    >
                      {copied === gift.id ? (
                        <Check size={14} />
                      ) : (
                        <Copy size={14} />
                      )}
                      {copied === gift.id ? "Nomor tersalin" : "Salin Rekening"}
                    </button>
                  </article>
                ))}
              </div>
              <small>Transfer dilakukan melalui aplikasi bank Anda.</small>
            </section>
          )}
          <section className="invitation-section invitation-wishes" id="ucapan">
            <span className="invitation-eyebrow">
              KATA-KATA YANG MENGHANGATKAN
            </span>
            <h2>Doa & harapan</h2>
            {canRespond ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (wish.trim())
                    submit("wish", { message: wish.trim() }, "wish");
                }}
              >
                <label className="invitation-field">
                  Ucapan untuk {couple}
                  <textarea
                    maxLength={1000}
                    minLength={2}
                    required
                    placeholder="Tuliskan doa dan harapan Anda…"
                    value={wish}
                    onChange={(e) => setWish(e.target.value)}
                    disabled={Boolean(busy)}
                  />
                </label>
                <div className="invitation-wish-form-footer">
                  <small>Ucapan akan dimoderasi oleh pasangan.</small>
                  <button
                    type="submit"
                    className="invitation-button"
                    disabled={Boolean(busy) || wish.trim().length < 2}
                  >
                    {busy === "wish" ? (
                      <LoaderCircle size={14} className="invitation-spin" />
                    ) : (
                      <Send size={14} />
                    )}{" "}
                    Kirim Ucapan
                  </button>
                </div>
              </form>
            ) : (
              <p className="invitation-wish-hint">
                {preview
                  ? "Ucapan contoh memperlihatkan tampilan setelah disetujui pasangan."
                  : "Buka tautan personal Anda untuk meninggalkan ucapan."}
              </p>
            )}
            <div className="invitation-wish-list">
              {current.wishes
                .filter((item) => item.status === "approved")
                .map((item) => (
                  <article key={item.id}>
                    <span className="invitation-wish-avatar">
                      {item.name.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{item.name}</strong>
                      <p>{item.message}</p>
                    </div>
                  </article>
                ))}
              {current.wishes.filter((item) => item.status === "approved")
                .length === 0 && (
                <p className="invitation-empty">
                  Jadilah yang pertama berbagi doa baik.
                </p>
              )}
            </div>
          </section>
          <footer className="invitation-footer">
            <Ornament />
            <p>{content.closing}</p>
            <h2>{couple}</h2>
            <span className="invitation-footer-note">DENGAN PENUH CINTA</span>
            <Link href="/" className="invitation-brand">
              Tamuara<span>Kisah kalian, dirayakan bersama.</span>
            </Link>
          </footer>
        </main>
      </div>
      {(notice || error) && (
        <div
          className={`invitation-toast ${error ? "is-error" : ""}`}
          role={error ? "alert" : "status"}
        >
          <span>{error || notice}</span>
          <button
            aria-label="Tutup pemberitahuan"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            ×
          </button>
        </div>
      )}
      {music && opened && !compact && (
        <>
          <audio
            src={music}
            ref={audioRef}
            loop
            preload="none"
            onError={() => setPlaying(false)}
          />
          <button
            className={`invitation-music ${playing ? "is-playing" : ""}`}
            onClick={toggleMusic}
            aria-label={playing ? "Jeda musik" : "Putar musik"}
          >
            {playing ? <Pause size={18} /> : <Music2 size={18} />}
          </button>
        </>
      )}
    </div>
  );
}
