"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Eye,
  Gift,
  ImagePlus,
  LoaderCircle,
  MapPin,
  Palette,
  Plus,
  Save,
  Send,
  Sparkles,
  Trash2,
  Users,
  BookHeart,
  CalendarDays,
  RefreshCw,
} from "lucide-react";
import type {
  Invitation,
  InvitationContent,
  WeddingEvent,
  PublicInvitation,
} from "@/lib/types";
import { THEMES } from "@/lib/catalog";
import type { RunMutation } from "./dashboard";
import InvitationView from "@/components/invitation/InvitationView";

export function InvitationEditor({
  invitation: inv,
  run,
  busy,
  onDirty,
  canPublish = true,
}: {
  invitation: Invitation;
  run: RunMutation;
  busy: boolean;
  onDirty: (v: boolean) => void;
  canPublish?: boolean;
}) {
  const [content, setContent] = useState<InvitationContent>(
      structuredClone(inv.content),
    ),
    [theme, setTheme] = useState(inv.theme),
    [slug, setSlug] = useState(inv.slug),
    [tab, setTab] = useState("couple"),
    [dirty, setDirty] = useState(false),
    [uploading, setUploading] = useState(false),
    [uploadError, setUploadError] = useState("");
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  function changed() {
    setDirty(true);
    onDirty(true);
  }
  function update(next: Partial<InvitationContent>) {
    setContent((c) => ({ ...c, ...next }));
    changed();
  }
  function eventUpdate(id: string, next: Partial<WeddingEvent>) {
    update({
      events: content.events.map((e) => (e.id === id ? { ...e, ...next } : e)),
    });
  }
  async function save() {
    const ok = await run("save", { content, theme, slug }, inv.id, inv.version);
    if (ok) {
      setDirty(false);
      onDirty(false);
    }
  }
  async function upload(files: FileList | null, target: "cover" | "gallery") {
    if (!files?.length) return;
    setUploading(true);
    setUploadError("");
    const urls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("invitationId", inv.id);
        const r = await fetch("/api/media", { method: "POST", body: fd });
        const result = await r.json();
        if (!r.ok) throw new Error(result.error || "Unggah gagal.");
        urls.push(result.url);
      }
      update(
        target === "cover"
          ? { coverUrl: urls[0] }
          : { gallery: [...content.gallery, ...urls].slice(0, 20) },
      );
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Unggah gagal.");
    } finally {
      setUploading(false);
    }
  }
  const tabs = [
    ["couple", Users, "Pasangan"],
    ["events", CalendarDays, "Acara"],
    ["story", BookHeart, "Cerita"],
    ["gallery", ImagePlus, "Galeri"],
    ["gifts", Gift, "Hadiah"],
    ["design", Palette, "Tampilan"],
  ] as const;
  const preview: PublicInvitation = {
    slug,
    theme,
    content,
    rsvps: [],
    wishes: [],
    preview: true,
    mode: "demo",
  };
  const paid = inv.orders.some((o) => o.status === "paid");
  return (
    <>
      <div className="editor-toolbar">
        <div>
          <span className={`save-dot ${dirty ? "unsaved" : ""}`} />
          {dirty ? "Ada perubahan belum disimpan" : "Semua perubahan tersimpan"}
        </div>
        <div className="button-group">
          <Link
            href={`/preview/${inv.previewToken}`}
            target="_blank"
            className="btn secondary"
          >
            <Eye size={15} />
            Pratinjau tersimpan
          </Link>
          <button
            className="btn secondary"
            onClick={save}
            disabled={busy || uploading || !dirty}
          >
            <Save size={15} />
            Simpan draf
          </button>
          {canPublish && (
            <button
              className="btn primary"
              disabled={busy || dirty || !paid}
              onClick={() => run("publish", {}, inv.id, inv.version)}
            >
              <Send size={15} />
              {inv.status === "published" ? "Terbitkan perubahan" : "Terbitkan"}
            </button>
          )}
        </div>
      </div>
      {!paid && canPublish && (
        <div className="inline-note">
          <Sparkles size={17} />
          <span>
            Draf dapat disimpan kapan saja. Aktifkan paket di{" "}
            <Link href={`/app?section=billing&id=${inv.id}`}>
              Paket & pembayaran
            </Link>{" "}
            sebelum menerbitkan.
          </span>
        </div>
      )}
      <div className="editor-layout">
        <section className="editor-panel">
          <div
            className="editor-tabs"
            role="tablist"
            aria-label="Bagian undangan"
          >
            {tabs.map(([id, Icon, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={tab === id ? "active" : ""}
              >
                <Icon size={16} />
                {label}
              </button>
            ))}
          </div>
          <div className="editor-fields" role="tabpanel">
            {tab === "couple" && (
              <>
                <EditorTitle
                  step="01"
                  title="Tentang kalian berdua"
                  text="Nama, keluarga, dan sapaan hangat untuk orang terkasih."
                />
                {(["bride", "groom"] as const).map((key, i) => (
                  <div className="form-section" key={key}>
                    <h3>
                      <span>{i + 1}</span>Mempelai{" "}
                      {i === 0 ? "pertama" : "kedua"}
                    </h3>
                    <div className="form-grid">
                      <label>
                        Nama panggilan
                        <input
                          value={content[key].name}
                          maxLength={40}
                          onChange={(e) =>
                            update({
                              [key]: { ...content[key], name: e.target.value },
                            })
                          }
                          placeholder={i === 0 ? "Ayu" : "Bima"}
                        />
                      </label>
                      <label>
                        Nama lengkap
                        <input
                          value={content[key].fullName}
                          maxLength={120}
                          onChange={(e) =>
                            update({
                              [key]: {
                                ...content[key],
                                fullName: e.target.value,
                              },
                            })
                          }
                          placeholder="Nama lengkap mempelai"
                        />
                      </label>
                    </div>
                    <label>
                      Nama orang tua <span className="optional">opsional</span>
                      <input
                        value={content[key].parents}
                        maxLength={240}
                        onChange={(e) =>
                          update({
                            [key]: { ...content[key], parents: e.target.value },
                          })
                        }
                        placeholder="Putri dari Bapak … & Ibu …"
                      />
                    </label>
                  </div>
                ))}
                <label>
                  Kalimat pembuka
                  <textarea
                    rows={4}
                    maxLength={2000}
                    value={content.opening}
                    onChange={(e) => update({ opening: e.target.value })}
                  />
                </label>
                <label>
                  Kalimat penutup
                  <textarea
                    rows={3}
                    maxLength={2000}
                    value={content.closing}
                    onChange={(e) => update({ closing: e.target.value })}
                  />
                </label>
              </>
            )}
            {tab === "events" && (
              <>
                <EditorTitle
                  step="02"
                  title="Hari yang dinantikan"
                  text="Lengkapi waktu dan tempat agar tamu mudah menemukan kalian."
                />
                {content.events.map((event, index) => (
                  <div className="form-section event-form" key={event.id}>
                    <div className="section-heading">
                      <h3>
                        <MapPin size={17} />
                        Acara {index + 1}
                      </h3>
                      {content.events.length > 1 && (
                        <button
                          className="icon-button danger"
                          aria-label={`Hapus acara ${index + 1}`}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Arsipkan acara ini dari draf? Jawaban tamu sebelumnya tetap disimpan.",
                              )
                            )
                              update({
                                events: content.events.filter(
                                  (e) => e.id !== event.id,
                                ),
                              });
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                    <label>
                      Nama acara
                      <input
                        value={event.title}
                        maxLength={100}
                        onChange={(e) =>
                          eventUpdate(event.id, { title: e.target.value })
                        }
                        placeholder="Akad nikah"
                      />
                    </label>
                    <div className="form-grid">
                      <label>
                        Tanggal
                        <input
                          type="date"
                          value={event.date}
                          onChange={(e) =>
                            eventUpdate(event.id, { date: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Zona waktu
                        <select
                          value={event.timezone}
                          onChange={(e) =>
                            eventUpdate(event.id, {
                              timezone: e.target
                                .value as WeddingEvent["timezone"],
                            })
                          }
                        >
                          <option value="Asia/Jakarta">WIB — Jakarta</option>
                          <option value="Asia/Makassar">WITA — Makassar</option>
                          <option value="Asia/Jayapura">WIT — Jayapura</option>
                        </select>
                      </label>
                      <label>
                        Mulai
                        <input
                          type="time"
                          value={event.time}
                          onChange={(e) =>
                            eventUpdate(event.id, { time: e.target.value })
                          }
                        />
                      </label>
                      <label>
                        Selesai
                        <input
                          type="time"
                          value={event.endTime}
                          onChange={(e) =>
                            eventUpdate(event.id, { endTime: e.target.value })
                          }
                        />
                      </label>
                    </div>
                    <label>
                      Nama tempat
                      <input
                        value={event.location}
                        maxLength={200}
                        onChange={(e) =>
                          eventUpdate(event.id, { location: e.target.value })
                        }
                        placeholder="Pendopo…"
                      />
                    </label>
                    <label>
                      Alamat
                      <textarea
                        value={event.address}
                        maxLength={500}
                        rows={2}
                        onChange={(e) =>
                          eventUpdate(event.id, { address: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Tautan Google Maps
                      <input
                        type="url"
                        value={event.mapUrl}
                        onChange={(e) =>
                          eventUpdate(event.id, { mapUrl: e.target.value })
                        }
                        placeholder="https://maps.google.com/…"
                      />
                    </label>
                  </div>
                ))}
                {content.events.length < 5 && (
                  <button
                    className="btn secondary"
                    onClick={() =>
                      update({
                        events: [
                          ...content.events,
                          {
                            id: crypto.randomUUID(),
                            title: "Resepsi",
                            date: "",
                            time: "11:00",
                            endTime: "14:00",
                            timezone: "Asia/Jakarta",
                            location: "",
                            address: "",
                            mapUrl: "",
                          },
                        ],
                      })
                    }
                  >
                    <Plus size={15} />
                    Tambah acara
                  </button>
                )}
                <label className="spaced-field">
                  Batas konfirmasi kehadiran
                  <input
                    type="date"
                    value={content.rsvpDeadline.slice(0, 10)}
                    onChange={(e) => update({ rsvpDeadline: e.target.value })}
                  />
                  <small>
                    Opsional. Kosongkan bila konfirmasi tetap dibuka.
                  </small>
                </label>
              </>
            )}
            {tab === "story" && (
              <>
                <EditorTitle
                  step="03"
                  title="Perjalanan menemukan kita"
                  text="Tidak harus panjang. Momen kecil pun punya arti besar."
                />
                {content.stories.map((story, i) => (
                  <div className="form-section" key={story.id}>
                    <div className="section-heading">
                      <h3>Bab {i + 1}</h3>
                      <button
                        className="icon-button danger"
                        aria-label="Hapus cerita"
                        onClick={() =>
                          update({
                            stories: content.stories.filter(
                              (s) => s.id !== story.id,
                            ),
                          })
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    <label>
                      Judul
                      <input
                        value={story.title}
                        maxLength={120}
                        onChange={(e) =>
                          update({
                            stories: content.stories.map((s) =>
                              s.id === story.id
                                ? { ...s, title: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Waktu atau tahun
                      <input
                        value={story.date}
                        maxLength={50}
                        onChange={(e) =>
                          update({
                            stories: content.stories.map((s) =>
                              s.id === story.id
                                ? { ...s, date: e.target.value }
                                : s,
                            ),
                          })
                        }
                        placeholder="Juni 2022"
                      />
                    </label>
                    <label>
                      Cerita
                      <textarea
                        rows={4}
                        value={story.body}
                        maxLength={2000}
                        onChange={(e) =>
                          update({
                            stories: content.stories.map((s) =>
                              s.id === story.id
                                ? { ...s, body: e.target.value }
                                : s,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
                <button
                  className="btn secondary"
                  onClick={() =>
                    update({
                      stories: [
                        ...content.stories,
                        {
                          id: crypto.randomUUID(),
                          title: "Pertemuan pertama",
                          date: "",
                          body: "",
                        },
                      ],
                    })
                  }
                >
                  <Plus size={15} />
                  Tambah bab cerita
                </button>
              </>
            )}
            {tab === "gallery" && (
              <>
                <EditorTitle
                  step="04"
                  title="Kenangan dalam bingkai"
                  text="Pilih foto terbaik untuk menyambut tamu kalian."
                />
                <label>Foto sampul</label>
                <div className="cover-upload">
                  {content.coverUrl && (
                    <img src={content.coverUrl} alt="Foto sampul undangan" />
                  )}
                  <label className="upload-control">
                    <ImagePlus size={18} />
                    {uploading ? "Mengunggah…" : "Pilih foto sampul"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={uploading}
                      onChange={(e) => upload(e.target.files, "cover")}
                    />
                  </label>
                </div>
                <small className="muted">
                  JPG, PNG, atau WebP. Foto dioptimalkan saat unggah.
                </small>
                <div className="section-heading spaced-field">
                  <h3>Galeri foto</h3>
                  <span className="muted small">
                    {content.gallery.length} / 20 foto
                  </span>
                </div>
                <div className="gallery-editor">
                  {content.gallery.map((url, i) => (
                    <div key={url + i}>
                      <img src={url} alt={`Foto galeri ${i + 1}`} />
                      <button
                        aria-label={`Hapus foto ${i + 1}`}
                        onClick={() =>
                          update({
                            gallery: content.gallery.filter((_, n) => n !== i),
                          })
                        }
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                  {content.gallery.length < 20 && (
                    <label className="gallery-add">
                      <Plus size={24} />
                      <span>Tambah foto</span>
                      <input
                        type="file"
                        multiple
                        accept="image/jpeg,image/png,image/webp"
                        disabled={uploading}
                        onChange={(e) => upload(e.target.files, "gallery")}
                      />
                    </label>
                  )}
                </div>
                {uploading && (
                  <p>
                    <LoaderCircle className="spin" size={15} /> Mengoptimalkan
                    foto…
                  </p>
                )}
                {uploadError && (
                  <p role="alert" className="error-box">
                    {uploadError}
                  </p>
                )}
              </>
            )}
            {tab === "gifts" && (
              <>
                <EditorTitle
                  step="05"
                  title="Perhatian penuh makna"
                  text="Hadiah ditransfer langsung ke rekening milik kalian."
                />
                <label className="check-label">
                  <input
                    type="checkbox"
                    checked={content.showGifts}
                    onChange={(e) => update({ showGifts: e.target.checked })}
                  />
                  Tampilkan amplop digital
                </label>
                {content.showGifts && (
                  <>
                    {content.gifts.map((gift, i) => (
                      <div className="form-section" key={gift.id}>
                        <div className="section-heading">
                          <h3>Tujuan hadiah {i + 1}</h3>
                          <button
                            className="icon-button danger"
                            aria-label="Hapus rekening"
                            onClick={() =>
                              update({
                                gifts: content.gifts.filter(
                                  (g) => g.id !== gift.id,
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        {[
                          ["bank", "Bank / dompet digital"],
                          ["name", "Nama pemilik rekening"],
                          ["number", "Nomor rekening / tujuan"],
                        ].map(([key, label]) => (
                          <label key={key}>
                            {label}
                            <input
                              value={gift[key as keyof typeof gift]}
                              maxLength={120}
                              onChange={(e) =>
                                update({
                                  gifts: content.gifts.map((g) =>
                                    g.id === gift.id
                                      ? { ...g, [key]: e.target.value }
                                      : g,
                                  ),
                                })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    ))}
                    <button
                      className="btn secondary"
                      onClick={() =>
                        update({
                          gifts: [
                            ...content.gifts,
                            {
                              id: crypto.randomUUID(),
                              bank: "",
                              name: "",
                              number: "",
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={15} />
                      Tambah rekening
                    </button>
                    <p className="inline-note">
                      Periksa nama dan nomor sebelum menerbitkan. Tamuara tidak
                      menerima dana hadiah atau memverifikasi transfer tamu.
                    </p>
                  </>
                )}
              </>
            )}
            {tab === "design" && (
              <>
                <EditorTitle
                  step="06"
                  title="Sentuhan terakhir"
                  text="Pilih suasana dan alamat undangan yang mudah diingat."
                />
                <label>
                  Tema undangan
                  <select
                    value={theme}
                    onChange={(e) => {
                      setTheme(e.target.value as typeof theme);
                      changed();
                    }}
                  >
                    {THEMES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.category}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Alamat undangan
                  <div className="input-prefix">
                    <span>/u/</span>
                    <input
                      value={slug}
                      disabled={!!inv.published}
                      maxLength={80}
                      pattern="[a-z0-9-]+"
                      onChange={(e) => {
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, ""),
                        );
                        changed();
                      }}
                    />
                  </div>
                  <small>
                    Alamat dikunci setelah publikasi pertama agar tautan yang
                    dibagikan tetap berlaku.
                  </small>
                </label>
                <label>
                  Musik latar <span className="optional">opsional</span>
                  <input
                    type="url"
                    value={content.musicUrl}
                    onChange={(e) => update({ musicUrl: e.target.value })}
                    placeholder="https://…/musik.mp3"
                  />
                  <small>
                    Gunakan audio berizin. Musik mulai setelah tamu membuka
                    undangan.
                  </small>
                </label>
                <div className="form-section">
                  <h3>Tautan pratinjau privat</h3>
                  <p className="muted small">
                    Siapa pun yang memiliki tautan ini dapat melihat draf. Ganti
                    tautan untuk mencabut akses sebelumnya.
                  </p>
                  <button
                    className="btn secondary"
                    disabled={busy || dirty}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Ganti tautan pratinjau? Tautan yang lama tidak dapat digunakan lagi.",
                        )
                      )
                        void run("regeneratePreview");
                    }}
                  >
                    <RefreshCw size={15} />
                    Ganti tautan pratinjau
                  </button>
                </div>
                {inv.status === "published" && canPublish && (
                  <div className="form-section">
                    <h3>Pengelolaan publikasi</h3>
                    <p className="muted small">
                      Nonaktifkan undangan untuk menutup halaman publik. Draf
                      tetap tersimpan.
                    </p>
                    <button
                      className="btn secondary danger"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "Nonaktifkan undangan yang sudah diterbitkan?",
                          )
                        )
                          void run("unpublish");
                      }}
                    >
                      Nonaktifkan undangan
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          <div className="editor-bottom">
            <span>
              <CheckCircle2 size={14} />
              Draf privat sampai diterbitkan
            </span>
            <button
              className="btn primary"
              disabled={busy || uploading || !dirty}
              onClick={save}
            >
              <Save size={15} />
              Simpan draf
            </button>
          </div>
        </section>
        <aside className="editor-preview">
          <div className="preview-label">
            <span>
              <span className="live-dot" />
              PRATINJAU LANGSUNG
            </span>
            <span>Ponsel</span>
          </div>
          <div className="phone-frame">
            <div className="phone-notch" />
            <div className="phone-screen">
              <InvitationView data={preview} compact />
            </div>
          </div>
          <p>
            Perubahan langsung terlihat di sini.
            <br />
            Simpan draf sebelum membagikan pratinjau.
          </p>
        </aside>
      </div>
    </>
  );
}
function EditorTitle({
  step,
  title,
  text,
}: {
  step: string;
  title: string;
  text: string;
}) {
  return (
    <div className="editor-title">
      <span className="eyebrow">BAGIAN {step}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
