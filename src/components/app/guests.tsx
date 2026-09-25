"use client";
import { useState } from "react";
import Papa from "papaparse";
import {
  Check,
  CheckCircle2,
  Copy,
  Download,
  FileUp,
  Link2,
  MessageCircle,
  Plus,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  X,
} from "lucide-react";
import type { Guest, Invitation } from "@/lib/types";
import { dateLabel } from "@/lib/catalog";
import { exportCSV } from "@/lib/client";
import type { RunMutation } from "./dashboard";
import { useDialogFocus } from "./use-dialog";

type GuestInput = {
  name: string;
  group: string;
  quota: number;
  eventIds: string[];
};
export function GuestManager({
  invitation: inv,
  run,
  busy,
  notice,
}: {
  invitation: Invitation;
  run: RunMutation;
  busy: boolean;
  notice: (t: string) => void;
}) {
  const [search, setSearch] = useState(""),
    [group, setGroup] = useState(""),
    [adding, setAdding] = useState(false),
    [share, setShare] = useState<Guest | null>(null),
    [importRows, setImportRows] = useState<GuestInput[] | null>(null),
    [importErrors, setImportErrors] = useState<string[]>([]);
  useDialogFocus(adding || !!share || !!importRows, () => {
    setAdding(false);
    setShare(null);
    setImportRows(null);
  });
  const groups = Array.from(new Set(inv.guests.map((g) => g.group || "Umum")));
  const guests = inv.guests.filter(
    (g) =>
      g.name.toLowerCase().includes(search.toLowerCase()) &&
      (!group || (g.group || "Umum") === group),
  );
  const url = (g: Guest) =>
    typeof window === "undefined"
      ? ""
      : `${window.location.origin}/u/${inv.slug}?guest=${encodeURIComponent(g.token)}`;
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      notice("Tautan berhasil disalin.");
    } catch {
      notice(
        "Browser tidak mengizinkan salin otomatis. Buka panel Bagikan untuk menyalin tautan.",
      );
    }
  }
  function csv(file: File | undefined) {
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim().toLowerCase(),
      complete: (result) => {
        const errors = result.errors.map(
          (e) => `Baris ${(e.row ?? 0) + 2}: ${e.message}`,
        );
        const rows: GuestInput[] = result.data.map((r, i) => {
          const name = (r.nama || r.name || "").trim();
          const quota = Number(r.kuota || r.quota || 1);
          if (!name) errors.push(`Baris ${i + 2}: nama wajib diisi.`);
          if (!Number.isInteger(quota) || quota < 1 || quota > 20)
            errors.push(`Baris ${i + 2}: kuota harus 1–20.`);
          if (name.length > 120)
            errors.push(`Baris ${i + 2}: nama terlalu panjang.`);
          return {
            name,
            quota,
            group: (r.kelompok || r.group || "Umum").trim(),
            eventIds: inv.content.events.map((e) => e.id),
          };
        });
        if (rows.length + inv.guests.length > 500)
          errors.push("Total penerima melebihi batas 500.");
        setImportRows(rows);
        setImportErrors(errors);
      },
      error: (e) => notice(e.message),
    });
  }
  const duplicates =
    importRows?.filter(
      (r, i, all) =>
        inv.guests.some((g) => g.name.toLowerCase() === r.name.toLowerCase()) ||
        all.findIndex((g) => g.name.toLowerCase() === r.name.toLowerCase()) !==
          i,
    ).length || 0;
  return (
    <>
      <div className="guest-summary">
        <div>
          <span className="round-icon">
            <Users size={22} />
          </span>
          <span>
            <strong>{inv.guests.length}</strong> penerima undangan{" "}
            <small>
              · {inv.guests.reduce((a, g) => a + g.quota, 0)} orang dalam kuota
            </small>
          </span>
        </div>
        <div className="button-group">
          <button
            className="btn secondary"
            onClick={() =>
              exportCSV("tamu-tamuara.csv", [
                ["nama", "kelompok", "kuota", "ditandai_terkirim"],
                ...inv.guests.map((g) => [
                  g.name,
                  g.group,
                  g.quota,
                  g.sent ? "Ya" : "Belum",
                ]),
              ])
            }
          >
            <Download size={15} />
            Ekspor
          </button>
          <label className="btn secondary file-button">
            <FileUp size={15} />
            Impor CSV
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                csv(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <button className="btn primary" onClick={() => setAdding(true)}>
            <Plus size={16} />
            Tambah tamu
          </button>
        </div>
      </div>
      <section className="panel">
        <div className="table-toolbar">
          <div className="search-field">
            <Search size={17} />
            <input
              aria-label="Cari nama tamu"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari orang terkasih…"
            />
          </div>
          <select
            aria-label="Filter kelompok"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="">Semua kelompok</option>
            {groups.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <span className="muted small">{guests.length} penerima</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>NAMA TAMU</th>
                <th>KELOMPOK</th>
                <th>KUOTA</th>
                <th>DIKIRIM MANUAL</th>
                <th>TAUTAN TAMU</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {guests.map((g, i) => (
                <tr key={g.id}>
                  <td>
                    <div className="guest-name">
                      <span className={`tiny-avatar tone-${i % 3}`}>
                        {g.name.charAt(0)}
                      </span>
                      <div>
                        <strong>{g.name}</strong>
                        <small className="cell-sub">
                          {g.eventIds
                            .map(
                              (id) =>
                                inv.content.events.find((e) => e.id === id)
                                  ?.title,
                            )
                            .filter(Boolean)
                            .join(" & ")}
                        </small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="group-pill">{g.group || "Umum"}</span>
                  </td>
                  <td>{g.quota} orang</td>
                  <td>
                    <label className="check-label inline-check">
                      <input
                        type="checkbox"
                        checked={g.sent}
                        disabled={busy}
                        onChange={(e) =>
                          run("updateGuest", {
                            guestId: g.id,
                            sent: e.target.checked,
                          })
                        }
                      />
                      {g.sent ? "Sudah ditandai" : "Belum"}
                    </label>
                  </td>
                  <td>
                    <div className="button-group">
                      <button
                        className="icon-button"
                        aria-label={`Salin tautan ${g.name}`}
                        disabled={inv.status !== "published"}
                        onClick={() => copy(url(g))}
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        className="btn secondary small-btn"
                        onClick={() => setShare(g)}
                        disabled={inv.status !== "published"}
                      >
                        <Send size={13} />
                        Bagikan
                      </button>
                    </div>
                  </td>
                  <td>
                    <button
                      className="icon-button danger"
                      aria-label={`Hapus ${g.name}`}
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            `Hapus penerima ${g.name}? Tautan dan data kehadirannya tidak lagi aktif.`,
                          )
                        )
                          void run("deleteGuest", { guestId: g.id });
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!guests.length && (
            <div className="empty-state compact">
              <Users size={28} />
              <h2>
                {search
                  ? "Nama belum ditemukan"
                  : "Tempat untuk orang terkasih"}
              </h2>
              <p>
                {search
                  ? "Coba kata pencarian lain."
                  : "Tambahkan tamu satu per satu atau impor dari CSV."}
              </p>
            </div>
          )}
        </div>
        <div className="table-footer">
          <span>
            Penanda terkirim diisi oleh kalian; bukan laporan pengiriman
            WhatsApp.
          </span>
          <button
            className="text-button"
            onClick={() =>
              exportCSV("contoh-impor-tamu.csv", [
                ["nama", "kelompok", "kuota"],
                ["Keluarga Sari", "Keluarga", 3],
                ["Raka", "Sahabat", 1],
              ])
            }
          >
            Unduh format CSV <Download size={13} />
          </button>
        </div>
      </section>
      {inv.status !== "published" && (
        <div className="inline-note">
          <Link2 size={17} />
          Terbitkan undangan terlebih dahulu untuk membagikan tautan tamu.
        </div>
      )}
      {adding && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guest-title"
          >
            <button
              className="modal-close"
              aria-label="Tutup"
              onClick={() => setAdding(false)}
            >
              <X size={20} />
            </button>
            <p className="eyebrow">SATU NAMA, BANYAK MAKNA</p>
            <h2 id="guest-title">Tambah orang terkasih</h2>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                if (
                  await run("addGuests", {
                    guests: [
                      {
                        name: fd.get("name"),
                        group: fd.get("group"),
                        quota: Number(fd.get("quota")),
                        eventIds: fd.getAll("event"),
                      },
                    ],
                  })
                )
                  setAdding(false);
              }}
            >
              <label>
                Nama penerima / keluarga
                <input
                  name="name"
                  required
                  maxLength={120}
                  placeholder="Keluarga Bapak Adi"
                  autoFocus
                />
              </label>
              <div className="form-grid">
                <label>
                  Kelompok
                  <input
                    name="group"
                    defaultValue="Keluarga"
                    list="guest-groups"
                    maxLength={50}
                  />
                  <datalist id="guest-groups">
                    <option>Keluarga</option>
                    <option>Sahabat</option>
                    <option>Rekan kerja</option>
                  </datalist>
                </label>
                <label>
                  Jumlah orang yang diundang
                  <input
                    type="number"
                    name="quota"
                    required
                    min={1}
                    max={20}
                    defaultValue={1}
                  />
                </label>
              </div>
              <fieldset className="event-checks">
                <legend>Diundang ke acara</legend>
                {inv.content.events.map((e) => (
                  <label className="check-label" key={e.id}>
                    <input
                      type="checkbox"
                      name="event"
                      value={e.id}
                      defaultChecked
                    />
                    {e.title}
                  </label>
                ))}
              </fieldset>
              <button className="btn primary full" disabled={busy}>
                <Plus size={15} />
                Tambah tamu
              </button>
            </form>
          </section>
        </div>
      )}
      {importRows && (
        <div className="modal-backdrop">
          <section
            className="modal modal-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-title"
          >
            <button
              className="modal-close"
              aria-label="Tutup"
              onClick={() => setImportRows(null)}
            >
              <X size={20} />
            </button>
            <h2 id="csv-title">Periksa daftar tamu</h2>
            <p className="muted">
              {importRows.length} baris akan ditambahkan. Semua acara terpilih
              secara default.
            </p>
            {duplicates > 0 && (
              <div className="inline-note">
                Ada {duplicates} nama yang sama dengan baris lain atau tamu yang
                sudah tersimpan. Nama sama tetap dibuat sebagai penerima
                terpisah; periksa dahulu.
              </div>
            )}
            {importErrors.length > 0 && (
              <div className="error-box" role="alert">
                <strong>Perbaiki CSV sebelum melanjutkan:</strong>
                <ul>
                  {importErrors.slice(0, 10).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="import-preview table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NAMA</th>
                    <th>KELOMPOK</th>
                    <th>KUOTA</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.slice(0, 30).map((r, i) => (
                    <tr key={i}>
                      <td>{r.name}</td>
                      <td>{r.group}</td>
                      <td>{r.quota}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {importRows.length > 30 && (
              <small className="muted">Menampilkan 30 baris pertama.</small>
            )}
            <div className="modal-actions">
              <button
                className="btn secondary"
                onClick={() => setImportRows(null)}
              >
                Batal
              </button>
              <button
                className="btn primary"
                disabled={busy || !!importErrors.length || !importRows.length}
                onClick={async () => {
                  if (await run("addGuests", { guests: importRows }))
                    setImportRows(null);
                }}
              >
                <Check size={16} />
                Tambahkan {importRows.length} penerima
              </button>
            </div>
          </section>
        </div>
      )}
      {share && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
          >
            <button
              className="modal-close"
              aria-label="Tutup"
              onClick={() => setShare(null)}
            >
              <X size={20} />
            </button>
            <span className="modal-flower">
              <Send size={28} />
            </span>
            <h2 id="share-title">Untuk {share.name}</h2>
            <p className="muted">
              Sebuah undangan kecil untuk momen yang besar.
            </p>
            <label>
              Tautan personal
              <input
                value={url(share)}
                readOnly
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="share-message">
              Yth. {share.name},<br />
              <br />
              Dengan bahagia, kami mengundang Anda untuk merayakan pernikahan{" "}
              {inv.content.bride.name} & {inv.content.groom.name}.<br />
              <br />
              Detail acara dan konfirmasi kehadiran:
              <br />
              {url(share)}
              <br />
              <br />
              Kehadiran dan doa Anda sangat berarti bagi kami.
            </div>
            <div className="button-group">
              <button
                className="btn secondary"
                onClick={() => copy(url(share))}
              >
                <Copy size={15} />
                Salin tautan
              </button>
              <a
                className="btn primary"
                href={`https://wa.me/?text=${encodeURIComponent(`Yth. ${share.name},\n\nDengan bahagia, kami mengundang Anda untuk merayakan pernikahan ${inv.content.bride.name} & ${inv.content.groom.name}.\n\nDetail acara dan konfirmasi kehadiran:\n${url(share)}\n\nKehadiran dan doa Anda sangat berarti bagi kami.`)}`}
                target="_blank"
                rel="noreferrer"
              >
                <MessageCircle size={16} />
                Buka WhatsApp
              </a>
            </div>
            <p className="small muted">
              Setelah mengirim sendiri, tandai penerima di buku tamu.
            </p>
            <button
              className="text-button danger"
              disabled={busy}
              onClick={async () => {
                if (
                  window.confirm(
                    "Ganti tautan penerima ini? Tautan lama tidak akan berlaku.",
                  )
                ) {
                  if (await run("regenerateGuestToken", { guestId: share.id }))
                    setShare(null);
                }
              }}
            >
              <RefreshCw size={13} />
              Ganti tautan personal
            </button>
          </section>
        </div>
      )}
    </>
  );
}

export function ResponseManager({
  invitation: inv,
  run,
  busy,
}: {
  invitation: Invitation;
  run: RunMutation;
  busy: boolean;
}) {
  const [tab, setTab] = useState<"rsvp" | "wishes">("rsvp"),
    [eventId, setEventId] = useState(inv.content.events[0]?.id || "");
  const responses = inv.rsvps.filter((r) => r.eventId === eventId);
  const eligible = inv.guests.filter((g) => g.eventIds.includes(eventId));
  const attend = responses
    .filter((r) => r.status === "attending")
    .reduce((a, r) => a + r.count, 0);
  const no = responses.filter((r) => r.status === "declined").length;
  const pending = eligible.filter(
    (g) => !responses.some((r) => r.guestId === g.id),
  ).length;
  function exportResponses() {
    exportCSV("rsvp-tamuara.csv", [
      ["nama", "acara", "status", "jumlah_hadir"],
      ...inv.guests.flatMap((g) =>
        g.eventIds.map((id) => {
          const r = inv.rsvps.find(
            (r) => r.guestId === g.id && r.eventId === id,
          );
          return [
            g.name,
            inv.content.events.find((e) => e.id === id)?.title ||
              "Acara diarsipkan",
            r?.status === "attending"
              ? "Hadir"
              : r?.status === "declined"
                ? "Tidak hadir"
                : "Belum menjawab",
            r?.count || 0,
          ];
        }),
      ),
    ]);
  }
  return (
    <>
      <div className="section-switch">
        <button
          className={tab === "rsvp" ? "active" : ""}
          onClick={() => setTab("rsvp")}
        >
          <CheckCircle2 size={16} />
          Konfirmasi kehadiran
        </button>
        <button
          className={tab === "wishes" ? "active" : ""}
          onClick={() => setTab("wishes")}
        >
          <MessageCircle size={16} />
          Ucapan & doa{" "}
          <span>{inv.wishes.filter((w) => w.status === "pending").length}</span>
        </button>
      </div>
      {tab === "rsvp" ? (
        <>
          <div className="guest-summary">
            <label className="event-selector">
              Acara
              <select
                value={eventId}
                onChange={(e) => setEventId(e.target.value)}
              >
                {inv.content.events.map((e) => (
                  <option value={e.id} key={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn secondary" onClick={exportResponses}>
              <Download size={15} />
              Ekspor RSVP
            </button>
          </div>
          <div className="response-stats">
            <div>
              <span className="badge green">Hadir</span>
              <strong>
                {attend}
                <small>orang</small>
              </strong>
            </div>
            <div>
              <span className="badge rose">Berhalangan</span>
              <strong>
                {no}
                <small>penerima</small>
              </strong>
            </div>
            <div>
              <span className="badge neutral">Belum menjawab</span>
              <strong>
                {pending}
                <small>penerima</small>
              </strong>
            </div>
          </div>
          <section className="panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NAMA PENERIMA</th>
                    <th>KELOMPOK</th>
                    <th>STATUS</th>
                    <th>JUMLAH HADIR</th>
                    <th>DIPERBARUI</th>
                  </tr>
                </thead>
                <tbody>
                  {eligible.map((g) => {
                    const r = responses.find((r) => r.guestId === g.id);
                    return (
                      <tr key={g.id}>
                        <td>
                          <strong>{g.name}</strong>
                        </td>
                        <td>{g.group}</td>
                        <td>
                          <span
                            className={`badge ${r?.status === "attending" ? "green" : r ? "rose" : "neutral"}`}
                          >
                            {r?.status === "attending"
                              ? "Akan hadir"
                              : r
                                ? "Berhalangan"
                                : "Belum menjawab"}
                          </span>
                        </td>
                        <td>
                          {r?.count || 0} / {g.quota}
                        </td>
                        <td>{r ? dateLabel(r.updatedAt) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!eligible.length && (
                <div className="empty-state compact">
                  <Users size={27} />
                  <p>Belum ada tamu untuk acara ini.</p>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        <div className="wishes-grid">
          {inv.wishes.length ? (
            inv.wishes.map((w) => (
              <section className="wish-card" key={w.id}>
                <div className="section-heading">
                  <div className="guest-name">
                    <span className="tiny-avatar">{w.name.charAt(0)}</span>
                    <div>
                      <strong>{w.name}</strong>
                      <small className="cell-sub">
                        {dateLabel(w.createdAt)}
                      </small>
                    </div>
                  </div>
                  <span
                    className={`badge ${w.status === "approved" ? "green" : "neutral"}`}
                  >
                    {w.status === "approved"
                      ? "Ditampilkan"
                      : w.status === "hidden"
                        ? "Disembunyikan"
                        : "Menunggu"}
                  </span>
                </div>
                <p className="wish-text">“{w.message}”</p>
                <div className="button-group">
                  {w.status !== "approved" && (
                    <button
                      disabled={busy}
                      className="btn secondary small-btn"
                      onClick={() =>
                        run("moderateWish", {
                          wishId: w.id,
                          status: "approved",
                        })
                      }
                    >
                      <Check size={14} />
                      Tampilkan
                    </button>
                  )}
                  {w.status !== "hidden" && (
                    <button
                      disabled={busy}
                      className="text-button"
                      onClick={() =>
                        run("moderateWish", { wishId: w.id, status: "hidden" })
                      }
                    >
                      Sembunyikan
                    </button>
                  )}
                </div>
              </section>
            ))
          ) : (
            <div className="empty-state">
              <MessageCircle size={30} />
              <h2>Doa baik akan hadir di sini.</h2>
              <p>
                Ucapan tamu menunggu persetujuan sebelum tampil pada undangan.
              </p>
            </div>
          )}
        </div>
      )}
    </>
  );
}
