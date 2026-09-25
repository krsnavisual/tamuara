"use client";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  CreditCard,
  Eye,
  Flower2,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Palette,
  PenLine,
  Plus,
  Users,
  X,
  LoaderCircle,
  CalendarDays,
  ShieldCheck,
  ExternalLink,
  Send,
} from "lucide-react";
import type { Invitation, Mutation, Workspace } from "@/lib/types";
import { dateLabel, money, PLANS, THEMES } from "@/lib/catalog";
import { loadWorkspace, mutateWorkspace } from "@/lib/client";
import { InvitationEditor } from "./editor";
import { useDialogFocus } from "./use-dialog";
import { GuestManager, ResponseManager } from "./guests";
import "./dashboard.css";

export type RunMutation = (
  action: string,
  payload?: Record<string, unknown>,
  id?: string,
  version?: number,
) => Promise<boolean>;
const sectionNames: Record<string, string> = {
  overview: "Ringkasan",
  invitations: "Undangan saya",
  editor: "Editor undangan",
  guests: "Buku tamu",
  responses: "RSVP & ucapan",
  themes: "Tema undangan",
  billing: "Paket & pembayaran",
  help: "Bantuan admin",
  jobs: "Pekerjaan admin",
};
const statusLabel: Record<string, string> = {
  draft: "Draf",
  published: "Sudah terbit",
  archived: "Diarsipkan",
  none: "Belum diminta",
  submitted: "Menunggu admin",
  in_progress: "Sedang dirangkai",
  awaiting_review: "Menunggu persetujuan",
  revision_requested: "Permintaan revisi",
  approved: "Disetujui",
  completed: "Selesai",
};

type AdminAssistanceRequest = {
  invitationId: string;
  documentVersion: number;
  updatedAt: string;
};

async function loadAdminAssistanceRequests(): Promise<
  AdminAssistanceRequest[]
> {
  const response = await fetch("/api/admin/assistance", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(data.error || "Antrean bantuan belum dapat dimuat.");
  if (!Array.isArray(data.requests))
    throw new Error("Respon antrean bantuan tidak valid.");
  return data.requests;
}

export function Dashboard({ admin = false }: { admin?: boolean }) {
  const router = useRouter(),
    params = useSearchParams();
  const [ws, setWs] = useState<Workspace | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [create, setCreate] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    ),
    [dirty, setDirty] = useState(false),
    [assistanceRequests, setAssistanceRequests] = useState<
      AdminAssistanceRequest[]
    >([]),
    [queueLoading, setQueueLoading] = useState(admin),
    [queueError, setQueueError] = useState(""),
    [claimingId, setClaimingId] = useState<string | null>(null);
  const section = params.get("section") || "overview";
  const inv =
    ws?.invitations.find((v) => v.id === params.get("id")) ||
    ws?.invitations[0];
  useEffect(() => {
    loadWorkspace()
      .then(setWs)
      .catch((e) => {
        if (e.status === 401) router.replace("/masuk");
        else setError(e.message);
      });
  }, [router]);
  const refreshAssistanceQueue = useCallback(async () => {
    setQueueLoading(true);
    setQueueError("");
    try {
      const requests = await loadAdminAssistanceRequests();
      setAssistanceRequests(requests);
      return requests;
    } catch (e) {
      setQueueError(
        e instanceof Error ? e.message : "Antrean bantuan belum dapat dimuat.",
      );
      throw e;
    } finally {
      setQueueLoading(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    if (admin && ws?.user.role === "admin" && ws.mode === "supabase")
      queueMicrotask(() => {
        if (active) void refreshAssistanceQueue().catch(() => {});
      });
    return () => {
      active = false;
    };
  }, [admin, ws?.user.role, ws?.mode, refreshAssistanceQueue]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  function navigate(s: string, id = inv?.id) {
    if (
      dirty &&
      !window.confirm("Perubahan belum disimpan. Tinggalkan editor?")
    )
      return;
    setDirty(false);
    setMobile(false);
    router.push(
      `${admin ? "/admin" : "/app"}?section=${s}${id ? "&id=" + id : ""}`,
    );
  }
  const run: RunMutation = async (
    action,
    payload = {},
    id = inv?.id,
    version,
  ) => {
    setBusy(true);
    try {
      const before = ws?.invitations.map((i) => i.id) || [];
      const result = await mutateWorkspace({
        action,
        payload,
        invitationId: id,
        version,
      } as Mutation);
      setWs(result);
      setToast({
        text:
          action === "publish"
            ? "Undangan berhasil diterbitkan."
            : action === "demoPay"
              ? "Simulasi pembayaran selesai. Paket sudah aktif."
              : "Perubahan tersimpan.",
      });
      if (action === "create") {
        setCreate(false);
        navigate(
          "editor",
          result.invitations.find((i) => !before.includes(i.id))?.id,
        );
      }
      return true;
    } catch (e) {
      setToast({
        text: e instanceof Error ? e.message : "Perubahan belum tersimpan.",
        error: true,
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const notice = (text: string) => setToast({ text });
  async function claimAssistance(request: AdminAssistanceRequest) {
    setClaimingId(request.invitationId);
    setQueueError("");
    try {
      const response = await fetch("/api/admin/assistance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitationId: request.invitationId,
          expectedVersion: request.documentVersion,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok)
        throw new Error(
          data.error ||
            (response.status === 409
              ? "Permintaan ini sudah berubah. Segarkan antrean sebelum mencoba lagi."
              : "Permintaan belum berhasil diambil."),
        );

      setAssistanceRequests((current) =>
        current.filter((item) => item.invitationId !== request.invitationId),
      );
      const [workspaceResult, queueResult] = await Promise.allSettled([
        loadWorkspace(),
        refreshAssistanceQueue(),
      ]);
      if (workspaceResult.status === "fulfilled") {
        setWs(workspaceResult.value);
        navigate("jobs", request.invitationId);
      }
      setToast({
        text:
          workspaceResult.status === "fulfilled" &&
          queueResult.status === "fulfilled"
            ? "Permintaan berhasil diambil. Pekerjaan kini ada di ruang admin."
            : "Permintaan berhasil diambil, tetapi tampilan belum sepenuhnya diperbarui. Muat ulang halaman.",
        error:
          workspaceResult.status === "rejected" ||
          queueResult.status === "rejected",
      });
    } catch (e) {
      await refreshAssistanceQueue().catch(() => {});
      setQueueError(
        e instanceof Error ? e.message : "Permintaan belum berhasil diambil.",
      );
    } finally {
      setClaimingId(null);
    }
  }
  async function logout() {
    if (dirty && !window.confirm("Perubahan belum disimpan. Tetap keluar?"))
      return;
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    router.push("/masuk");
  }
  if (error)
    return (
      <main className="app-loading">
        <p className="error-box">{error}</p>
        <Link href="/" className="btn secondary">
          Kembali ke beranda
        </Link>
      </main>
    );
  if (!ws)
    return (
      <main className="app-loading">
        <Flower2 className="spin" size={38} />
        <p>Menyiapkan ruang cerita kalian…</p>
      </main>
    );
  if (admin && ws.user.role !== "admin")
    return (
      <main className="app-loading">
        <h2>Halaman khusus admin</h2>
        <Link href="/app" className="btn primary">
          Ke dashboard pasangan
        </Link>
      </main>
    );
  const nav = admin
    ? [
        ["overview", LayoutDashboard, "Ringkasan"],
        ["jobs", ClipboardList, "Pekerjaan admin"],
        ["invitations", Mail, "Undangan"],
        ["guests", Users, "Buku tamu"],
        ["billing", CreditCard, "Pembayaran"],
      ]
    : [
        ["overview", LayoutDashboard, "Ringkasan"],
        ["invitations", Mail, "Undangan saya"],
        ["guests", Users, "Buku tamu"],
        ["responses", MessageCircle, "RSVP & ucapan"],
        ["themes", Palette, "Tema undangan"],
        ["billing", CreditCard, "Paket & pembayaran"],
      ];
  return (
    <div className="app-shell">
      {mobile && (
        <button
          aria-label="Tutup navigasi"
          className="sidebar-backdrop"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`app-sidebar ${mobile ? "open" : ""}`}>
        <Link href="/" className="app-brand">
          <span className="brand-symbol">
            <img src="/brand/tamuara-logo.png" alt="" />
          </span>
          Tamuara<span className="brand-dot">✦</span>
        </Link>
        <div className="workspace-label">
          {admin ? "RUANG ADMIN" : "RUANG CERITA KALIAN"}
        </div>
        <nav>
          {nav.map(([key, Icon, label]) => {
            const I = Icon as typeof Mail;
            return (
              <button
                key={key as string}
                className={`nav-item ${section === key ? "active" : ""}`}
                onClick={() => navigate(key as string)}
              >
                <I size={18} strokeWidth={1.6} />
                <span>{label as string}</span>
                {section === key && <span className="nav-dot" />}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-help">
          <div className="help-icon">
            <HeartHandshake size={24} strokeWidth={1.2} />
          </div>
          <p>
            Dirangkai bersama,
            <br />
            terasa lebih mudah.
          </p>
          <button onClick={() => navigate("help")}>
            Minta bantuan admin <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${section === "help" ? "active" : ""}`}
            onClick={() => navigate("help")}
          >
            <MessageCircle size={18} />
            Pusat bantuan
          </button>
          <button className="nav-item" onClick={logout}>
            <LogOut size={18} />
            Keluar
          </button>
        </div>
        <div className="sidebar-foot">
          Dibuat untuk kisah yang berarti <span>♡</span>
        </div>
      </aside>
      <div className="app-body">
        <header className="app-topbar">
          <button
            className="mobile-toggle"
            aria-label="Buka navigasi"
            onClick={() => setMobile(true)}
          >
            <Menu size={23} />
          </button>
          <div className="breadcrumb">
            {admin ? "Admin" : "Dashboard"} <ChevronRight size={13} />
            <span>{sectionNames[section] || "Ringkasan"}</span>
          </div>
          <div className="topbar-right">
            {ws.mode === "demo" && (
              <span className="demo-badge">Versi lokal · demo</span>
            )}
            <span className="topbar-divider" />
            <div className="profile-avatar">{ws.user.name.charAt(0)}</div>
            <div className="profile-name">
              <strong>{ws.user.name}</strong>
              <small>{admin ? "Tim Tamuara" : "Ruang pasangan"}</small>
            </div>
          </div>
        </header>
        <main className="app-main">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {section === "overview"
                  ? "SEBUAH PERJALANAN ISTIMEWA"
                  : "TAMUARA / " +
                    (sectionNames[section] || "UNDANGAN").toUpperCase()}
              </p>
              <h1>
                {section === "overview"
                  ? `Selamat datang, ${ws.user.name.split(/[ &]/)[0]}.`
                  : sectionNames[section] || "Undangan kalian"}
                {section === "overview" && (
                  <span className="greeting-flower">✳</span>
                )}
              </h1>
              <p>
                {section === "overview"
                  ? "Setiap detail kecil, untuk hari yang paling berarti."
                  : section === "guests"
                    ? "Orang-orang terkasih yang akan merayakan bersama kalian."
                    : section === "editor"
                      ? "Rangkai setiap detail agar terasa seperti kalian."
                      : section === "themes"
                        ? "Temukan suasana yang paling dekat dengan cerita kalian."
                        : "Semua yang kalian perlukan, dalam satu ruang."}
              </p>
            </div>
            {section !== "editor" && !admin && (
              <button className="btn primary" onClick={() => setCreate(true)}>
                <Plus size={16} />
                Buat undangan
              </button>
            )}
          </div>
          {ws.invitations.length > 1 &&
            section !== "overview" &&
            section !== "invitations" &&
            section !== "jobs" && (
              <label className="invitation-select">
                Undangan aktif
                <select
                  value={inv?.id}
                  onChange={(e) => navigate(section, e.target.value)}
                >
                  {ws.invitations.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.content.bride.name} & {i.content.groom.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {admin && (section === "overview" || section === "jobs") && (
            <AdminAssistanceQueue
              mode={ws.mode}
              requests={assistanceRequests}
              loading={queueLoading}
              error={queueError}
              claimingId={claimingId}
              onRefresh={() => void refreshAssistanceQueue().catch(() => {})}
              onClaim={(request) => void claimAssistance(request)}
            />
          )}
          {!inv ? (
            admin ? (
              <EmptyState
                title="Belum ada undangan yang ditugaskan."
                text="Permintaan baru muncul di antrean bantuan. Setelah diambil, pekerjaan dan detail undangan akan tersedia di sini."
                action={
                  section !== "overview" && section !== "jobs" ? (
                    <button
                      className="btn secondary"
                      onClick={() => navigate("jobs")}
                    >
                      Lihat antrean bantuan
                    </button>
                  ) : undefined
                }
              />
            ) : (
              <EmptyState
                title="Kisah pertama kalian dimulai di sini."
                text="Pilih tema dan mulai merangkai undangan. Semua isian bisa dilanjutkan nanti."
                action={
                  <button
                    className="btn primary"
                    onClick={() => setCreate(true)}
                  >
                    <Plus size={16} />
                    Buat undangan pertama
                  </button>
                }
              />
            )
          ) : (
            <>
              {section === "overview" &&
                (admin ? (
                  <AdminOverview ws={ws} navigate={navigate} />
                ) : (
                  <Overview inv={inv} ws={ws} navigate={navigate} />
                ))}
              {section === "invitations" && (
                <div className="invitation-grid">
                  {ws.invitations.map((i) => (
                    <InvitationCard
                      key={i.id}
                      inv={i}
                      onEdit={() => navigate("editor", i.id)}
                    />
                  ))}
                </div>
              )}
              {section === "editor" && (
                <InvitationEditor
                  key={inv.id + ":" + inv.version}
                  invitation={inv}
                  run={run}
                  busy={busy}
                  onDirty={setDirty}
                  canPublish={!admin}
                />
              )}
              {section === "guests" && (
                <GuestManager
                  invitation={inv}
                  run={run}
                  busy={busy}
                  notice={notice}
                />
              )}
              {section === "responses" && (
                <ResponseManager invitation={inv} run={run} busy={busy} />
              )}
              {section === "themes" && (
                <ThemeGallery inv={inv} run={run} busy={busy} />
              )}
              {section === "billing" && (
                <Billing
                  inv={inv}
                  run={run}
                  busy={busy}
                  mode={ws.mode}
                  readOnly={admin}
                />
              )}
              {(section === "help" || section === "jobs") && (
                <AssistancePanel
                  inv={inv}
                  ws={ws}
                  run={run}
                  busy={busy}
                  admin={admin}
                  navigate={navigate}
                />
              )}
            </>
          )}
          <footer className="app-footer">
            <span>© {new Date().getFullYear()} Tamuara</span>
            <span>Kisah kalian, dirayakan bersama.</span>
            <Link href="/privasi">Privasi</Link>
          </footer>
        </main>
      </div>
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "toast-error" : ""}`}
        >
          {toast.error ? <X size={18} /> : <CheckCircle2 size={18} />}
          <span>{toast.text}</span>
          <button
            aria-label="Tutup pemberitahuan"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {create && (
        <CreateDialog run={run} busy={busy} onClose={() => setCreate(false)} />
      )}
    </div>
  );
}

function Overview({
  inv,
  ws,
  navigate,
}: {
  inv: Invitation;
  ws: Workspace;
  navigate: (section: string, id?: string) => void;
}) {
  const answered = new Set(inv.rsvps.map((r) => r.guestId)).size;
  const firstEvent = inv.content.events[0];
  const attendees = inv.rsvps
    .filter((r) => r.eventId === firstEvent?.id && r.status === "attending")
    .reduce((a, r) => a + r.count, 0);
  const wishes = inv.wishes.length;
  const paid = inv.orders.some((o) => o.status === "paid");
  return (
    <>
      <div className="overview-intro">
        <InvitationCard inv={inv} onEdit={() => navigate("editor")} />
        <section className="journey-card">
          <div className="section-heading">
            <p className="eyebrow">SATU LANGKAH LEBIH DEKAT</p>
            <Flower2 size={22} strokeWidth={1} />
          </div>
          <h2>
            Siap untuk
            <br />
            <em>hari bahagia?</em>
          </h2>
          <div className="checklist">
            {[
              {
                done: !!inv.content.bride.name && !!inv.content.groom.name,
                label: "Lengkapi cerita kalian",
                section: "editor",
              },
              {
                done: paid,
                label: "Aktifkan paket undangan",
                section: "billing",
              },
              {
                done: inv.status === "published",
                label: "Terbitkan undangan",
                section: "editor",
              },
              {
                done: inv.guests.some((g) => g.sent),
                label: "Bagikan ke orang terkasih",
                section: "guests",
              },
            ].map((item, i) => (
              <button key={i} onClick={() => navigate(item.section)}>
                <span
                  className={item.done ? "step-check checked" : "step-check"}
                >
                  {item.done ? <Check size={12} /> : i + 1}
                </span>
                <span>{item.label}</span>
                <ChevronRight size={14} />
              </button>
            ))}
          </div>
        </section>
      </div>
      <div className="stat-grid">
        <Stat
          icon={<Users />}
          label="Penerima undangan"
          value={inv.guests.length}
          note="Orang & keluarga terkasih"
        />
        <Stat
          icon={<CheckCircle2 />}
          label="Konfirmasi hadir"
          value={attendees}
          note={firstEvent?.title || "Acara pertama"}
        />
        <Stat
          icon={<Clock3 />}
          label="Belum merespons"
          value={inv.guests.length - answered}
          note="Menanti kabar bahagia"
        />
        <Stat
          icon={<MessageCircle />}
          label="Ucapan & doa"
          value={wishes}
          note={`${inv.wishes.filter((w) => w.status === "pending").length} menunggu persetujuan`}
        />
      </div>
      <div className="overview-lower">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Orang-orang terkasih</h2>
              <p>Kabar terbaru dari buku tamu kalian.</p>
            </div>
            <button className="text-button" onClick={() => navigate("guests")}>
              Lihat semua <ArrowRight size={15} />
            </button>
          </div>
          {inv.guests.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NAMA TAMU</th>
                    <th>KELOMPOK</th>
                    <th>KONFIRMASI</th>
                  </tr>
                </thead>
                <tbody>
                  {inv.guests.slice(0, 4).map((g, i) => {
                    const r = inv.rsvps.find((r) => r.guestId === g.id);
                    return (
                      <tr key={g.id}>
                        <td>
                          <div className="guest-name">
                            <span className={`tiny-avatar tone-${i % 3}`}>
                              {g.name.charAt(0)}
                            </span>
                            <strong>{g.name}</strong>
                          </div>
                        </td>
                        <td>{g.group || "Umum"}</td>
                        <td>
                          <span
                            className={`badge ${r?.status === "attending" ? "green" : r?.status === "declined" ? "rose" : "neutral"}`}
                          >
                            {r?.status === "attending"
                              ? "Akan hadir"
                              : r?.status === "declined"
                                ? "Berhalangan"
                                : "Belum merespons"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="padded muted">
              Belum ada tamu. Mulai dengan menambahkan keluarga dan sahabat.
            </p>
          )}
        </section>
        <section className="companion-card">
          <span className="companion-mark">
            <HeartHandshake size={32} strokeWidth={1} />
          </span>
          <p className="eyebrow">KAMI ADA UNTUK KALIAN</p>
          <h2>
            Sedikit bantuan,
            <br />
            banyak ketenangan.
          </h2>
          <p>
            Mulai dari menata foto hingga merangkai kata, admin kami siap
            mendampingi.
          </p>
          <button className="btn secondary" onClick={() => navigate("help")}>
            Dirangkai bersama <ArrowUpRight size={15} />
          </button>
        </section>
      </div>
      {ws.invitations.length > 1 && (
        <p className="muted small">
          Kalian memiliki {ws.invitations.length} undangan.{" "}
          <button
            className="text-button"
            onClick={() => navigate("invitations")}
          >
            Kelola semua undangan →
          </button>
        </p>
      )}
    </>
  );
}
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Mail size={37} strokeWidth={1} />
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
function Stat({
  icon,
  label,
  value,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  note: string;
}) {
  return (
    <section className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-icon">{icon}</span>
      </div>
      <strong className="stat-number">{value}</strong>
      <small>{note}</small>
    </section>
  );
}
function InvitationCard({
  inv,
  onEdit,
}: {
  inv: Invitation;
  onEdit: () => void;
}) {
  const t = THEMES.find((t) => t.id === inv.theme);
  return (
    <section className="invitation-card">
      <div
        className="invitation-card-art"
        style={{
          backgroundImage: `linear-gradient(90deg,rgba(42,37,30,.20),rgba(42,37,30,.06)),url("${inv.content.coverUrl || "/images/wedding-cover.jpg"}")`,
        }}
      >
        <span
          className={`badge ${inv.status === "published" ? "light" : "cream"}`}
        >
          {inv.status === "published" && <span className="live-dot" />}
          {statusLabel[inv.status]}
        </span>
        <div className="cover-caption">
          <span>THE WEDDING OF</span>
          <h2>
            {inv.content.bride.name || "Nama"} <i>&</i>{" "}
            {inv.content.groom.name || "Pasangan"}
          </h2>
          <p>{dateLabel(inv.content.events[0]?.date || "")}</p>
        </div>
        <span className="cover-corner">✦</span>
      </div>
      <div className="invitation-card-footer">
        <div>
          <strong>{t?.name}</strong>
          <small>
            <CalendarDays size={12} />
            {dateLabel(inv.content.events[0]?.date || "")}
          </small>
        </div>
        <div className="button-group">
          <Link
            className="btn icon-btn"
            href={`/preview/${inv.previewToken}`}
            target="_blank"
            aria-label="Pratinjau undangan"
          >
            <Eye size={17} />
          </Link>
          <button className="btn primary" onClick={onEdit}>
            <PenLine size={15} />
            Edit undangan
          </button>
        </div>
      </div>
    </section>
  );
}
function ThemeGallery({
  inv,
  run,
  busy,
}: {
  inv: Invitation;
  run: RunMutation;
  busy: boolean;
}) {
  return (
    <>
      <div className="inline-note">
        <Palette size={18} />
        <span>
          Isi undangan tetap tersimpan saat kalian berganti tema. Terbitkan
          perubahan dari editor untuk memperbarui undangan aktif.
        </span>
      </div>
      <div className="theme-grid">
        {THEMES.map((t, i) => (
          <section className="theme-card" key={t.id}>
            <div className={`theme-swatch swatch-${t.id}`}>
              <span>THE WEDDING OF</span>
              <Flower2 size={i === 1 ? 50 : 25} strokeWidth={0.7} />
              <h2>
                {inv.content.bride.name}
                <i>&</i>
                {inv.content.groom.name}
              </h2>
              <small>{dateLabel(inv.content.events[0]?.date || "")}</small>
            </div>
            <div className="theme-card-body">
              <span className="eyebrow">{t.category}</span>
              <h2>{t.name}</h2>
              <p>{t.description}</p>
              <div className="button-group">
                <Link
                  className="btn secondary"
                  href={`/demo/${t.id}`}
                  target="_blank"
                >
                  <Eye size={15} />
                  Lihat tema
                </Link>
                <button
                  className="btn primary"
                  disabled={busy || inv.theme === t.id}
                  onClick={() =>
                    run(
                      "save",
                      { theme: t.id, content: inv.content, slug: inv.slug },
                      inv.id,
                      inv.version,
                    )
                  }
                >
                  {inv.theme === t.id ? (
                    <>
                      <Check size={15} />
                      Dipilih
                    </>
                  ) : (
                    "Pilih tema"
                  )}
                </button>
              </div>
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
function Billing({
  inv,
  run,
  busy,
  mode,
  readOnly,
}: {
  inv: Invitation;
  run: RunMutation;
  busy: boolean;
  mode: string;
  readOnly: boolean;
}) {
  const active = inv.orders.filter((o) => o.status === "paid").at(-1);
  return (
    <>
      <div className="inline-note">
        <ShieldCheck size={19} />
        <span>
          {mode === "demo"
            ? "Pembayaran di versi lokal adalah simulasi. Tidak ada dana yang ditagihkan."
            : "Pembayaran belum dibuka. Kalian dapat menyiapkan draf; aktivasi paket tersedia setelah layanan pembayaran terhubung."}
        </span>
      </div>
      {active && (
        <div className="success-box">
          <CheckCircle2 size={20} />
          <span>
            Paket {PLANS.find((p) => p.id === active.plan)?.name} aktif.
            {inv.expiresAt
              ? " Berlaku sampai " + dateLabel(inv.expiresAt) + "."
              : ""}
          </span>
        </div>
      )}
      <div className="pricing-grid">
        {PLANS.map((p) => (
          <section
            key={p.id}
            className={`plan-card ${p.id === "assisted" ? "featured" : ""}`}
          >
            <p className="eyebrow">
              {p.id === "assisted"
                ? "DENGAN ADMIN PENDAMPING"
                : "UNTUK KALIAN YANG KREATIF"}
            </p>
            <h2>{p.name}</h2>
            <p>{p.description}</p>
            <div className="plan-price">
              {money(p.price)}
              <small>/ undangan</small>
            </div>
            <ul>
              {p.features.map((f) => (
                <li key={f}>
                  <Check size={15} />
                  {f}
                </li>
              ))}
            </ul>
            <button
              className="btn primary full"
              disabled={
                busy ||
                readOnly ||
                mode !== "demo" ||
                active?.plan === p.id ||
                active?.plan === "assisted"
              }
              onClick={() => run("checkout", { plan: p.id })}
            >
              {active
                ? active.plan === p.id
                  ? "Paket aktif"
                  : active.plan === "mandiri"
                    ? "Tingkatkan ke bantuan admin"
                    : "Termasuk paket aktif"
                : mode === "demo"
                  ? "Pilih paket"
                  : "Segera tersedia"}
              <ArrowRight size={16} />
            </button>
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Riwayat pesanan</h2>
            <p>Pembayaran layanan Tamuara, terpisah dari hadiah tamu.</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PESANAN</th>
                <th>PAKET</th>
                <th>NOMINAL</th>
                <th>STATUS</th>
                <th>AKSI</th>
              </tr>
            </thead>
            <tbody>
              {inv.orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <strong>{o.id.slice(0, 12)}</strong>
                    <small className="cell-sub">{dateLabel(o.createdAt)}</small>
                  </td>
                  <td>{PLANS.find((p) => p.id === o.plan)?.name}</td>
                  <td>{money(o.amount)}</td>
                  <td>
                    <span
                      className={`badge ${o.status === "paid" ? "green" : "neutral"}`}
                    >
                      {
                        {
                          paid: "Lunas",
                          pending: "Menunggu pembayaran",
                          failed: "Gagal",
                          expired: "Kedaluwarsa",
                        }[o.status]
                      }
                    </span>
                  </td>
                  <td>
                    {o.status === "pending" &&
                      !readOnly &&
                      (mode === "demo" ? (
                        <button
                          className="btn secondary small-btn"
                          disabled={busy}
                          onClick={() => run("demoPay", { orderId: o.id })}
                        >
                          Simulasikan lunas
                        </button>
                      ) : o.paymentUrl ? (
                        <a
                          href={o.paymentUrl}
                          className="text-button"
                          target="_blank"
                          rel="noreferrer"
                        >
                          Bayar <ExternalLink size={13} />
                        </a>
                      ) : (
                        <span className="muted">Menyiapkan pembayaran</span>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!inv.orders.length && (
            <p className="padded muted">
              Belum ada pesanan. Pilih paket setelah draf kalian siap.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
function AssistancePanel({
  inv,
  ws,
  run,
  busy,
  admin,
  navigate,
}: {
  inv: Invitation;
  ws: Workspace;
  run: RunMutation;
  busy: boolean;
  admin: boolean;
  navigate: (s: string, id?: string) => void;
}) {
  const [text, setText] = useState("");
  const needsBrief = !admin && !inv.service.brief;
  return (
    <div className="assistance-layout">
      <section className="panel padded">
        <p className="eyebrow">DIRANGKAI BERSAMA</p>
        <h2 className="serif">Cerita kalian, dengan sedikit bantuan.</h2>
        <p className="muted">
          Sampaikan hal yang ingin dibantu. Tim akan menyiapkan draf, lalu
          kalian memeriksa dan menerbitkannya sendiri.
        </p>
        <span className="badge rose">{statusLabel[inv.service.status]}</span>
        <p className="small muted" style={{ marginTop: 16 }}>
          Revisi tercatat: {inv.service.revisions} · Paket bantuan mencakup 2
          putaran revisi.
        </p>
        {inv.service.brief && (
          <div className="brief-box">
            <strong>Brief undangan</strong>
            <p>{inv.service.brief}</p>
          </div>
        )}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const success = await run(
              needsBrief ? "requestAssistance" : "updateService",
              needsBrief ? { brief: text } : { message: text },
            );
            if (success) setText("");
          }}
        >
          <label>
            {needsBrief
              ? "Ceritakan kebutuhan kalian"
              : "Catatan atau permintaan revisi"}
            <textarea
              required
              minLength={5}
              maxLength={2000}
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              placeholder="Contoh: bantu pilih foto dan rapikan kalimat pembuka…"
            />
          </label>
          <button className="btn primary" disabled={busy}>
            <Send size={15} />
            {needsBrief ? "Kirim permintaan bantuan" : "Kirim catatan"}
          </button>
        </form>
        <div className="service-actions">
          {admin && inv.service.status !== "none" && (
            <>
              <button
                className="btn secondary"
                disabled={
                  busy ||
                  !["submitted", "revision_requested"].includes(
                    inv.service.status,
                  )
                }
                onClick={() => run("updateService", { status: "in_progress" })}
              >
                Mulai kerjakan
              </button>
              <button
                className="btn secondary"
                disabled={busy || inv.service.status !== "in_progress"}
                onClick={() =>
                  run("updateService", { status: "awaiting_review" })
                }
              >
                Minta pemeriksaan pasangan
              </button>
              {inv.service.status === "approved" && (
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={() => run("updateService", { status: "completed" })}
                >
                  Tandai selesai
                </button>
              )}
              <button
                className="btn primary"
                onClick={() => navigate("editor", inv.id)}
              >
                <PenLine size={15} />
                Buka editor
              </button>
            </>
          )}
          {!admin && inv.service.status === "awaiting_review" && (
            <>
              <button
                className="btn primary"
                disabled={busy}
                onClick={() =>
                  run(
                    "updateService",
                    { status: "approved" },
                    inv.id,
                    inv.version,
                  )
                }
              >
                <Check size={16} />
                Setujui draf
              </button>
              <button
                className="btn secondary"
                disabled={busy || text.trim().length < 5}
                onClick={() =>
                  run("updateService", {
                    status: "revision_requested",
                    message: text,
                  })
                }
              >
                Minta revisi
              </button>
            </>
          )}
          <Link
            className="text-button"
            href={`/preview/${inv.previewToken}`}
            target="_blank"
          >
            Periksa draf <Eye size={15} />
          </Link>
        </div>
      </section>
      <div>
        <section className="panel padded">
          <h2>Catatan perjalanan</h2>
          {inv.service.messages.length ? (
            <div className="service-messages">
              {inv.service.messages.map((m) => (
                <div key={m.id}>
                  <div>
                    <strong>{m.author}</strong>
                    <time>{dateLabel(m.createdAt)}</time>
                  </div>
                  <p>{m.text}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Catatan dari kalian dan admin akan muncul di sini.
            </p>
          )}
        </section>
        {admin && (
          <section className="panel padded">
            <h2>Daftar pekerjaan</h2>
            {ws.invitations.map((i) => (
              <button
                key={i.id}
                className="job-row"
                onClick={() => navigate("jobs", i.id)}
              >
                <span>
                  {i.content.bride.name} & {i.content.groom.name}
                  <small>{statusLabel[i.service.status]}</small>
                </span>
                <ChevronRight size={15} />
              </button>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
function AdminAssistanceQueue({
  mode,
  requests,
  loading,
  error,
  claimingId,
  onRefresh,
  onClaim,
}: {
  mode: Workspace["mode"];
  requests: AdminAssistanceRequest[];
  loading: boolean;
  error: string;
  claimingId: string | null;
  onRefresh: () => void;
  onClaim: (request: AdminAssistanceRequest) => void;
}) {
  return (
    <section className="panel admin-queue" aria-busy={loading}>
      <div className="panel-header">
        <div>
          <h2>Antrean bantuan</h2>
          <p>
            Ambil permintaan untuk membuka detail dan mulai membantu pasangan.
          </p>
        </div>
        {mode === "supabase" && (
          <button
            className="btn secondary small-btn"
            onClick={onRefresh}
            disabled={loading || claimingId !== null}
          >
            {loading ? <LoaderCircle size={14} className="spin" /> : null}
            Segarkan
          </button>
        )}
      </div>
      {mode === "demo" ? (
        <p className="padded muted">
          Antrean bantuan tersedia ketika ruang admin terhubung ke Supabase.
        </p>
      ) : (
        <div className="admin-queue-list">
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          {loading && !requests.length ? (
            <p className="muted">Memuat permintaan bantuan…</p>
          ) : error && !requests.length ? null : !requests.length ? (
            <p className="muted">Belum ada permintaan yang menunggu admin.</p>
          ) : (
            requests.map((request) => {
              const updatedAt = new Date(request.updatedAt);
              return (
                <div className="admin-queue-row" key={request.invitationId}>
                  <div>
                    <strong>
                      Permintaan #{request.invitationId.slice(0, 8)}
                    </strong>
                    <small>
                      Diperbarui{" "}
                      {Number.isNaN(updatedAt.getTime())
                        ? "baru saja"
                        : updatedAt.toLocaleString("id-ID", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })}
                    </small>
                  </div>
                  <button
                    className="btn primary small-btn"
                    disabled={claimingId !== null || loading}
                    onClick={() => onClaim(request)}
                  >
                    {claimingId === request.invitationId ? (
                      <LoaderCircle size={14} className="spin" />
                    ) : null}
                    Ambil pekerjaan
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}
    </section>
  );
}
function AdminOverview({
  ws,
  navigate,
}: {
  ws: Workspace;
  navigate: (s: string, id?: string) => void;
}) {
  return (
    <>
      <div className="stat-grid">
        <Stat
          icon={<Mail />}
          label="Undangan yang dikelola"
          value={ws.invitations.length}
          note="Sesuai penugasan"
        />
        <Stat
          icon={<PenLine />}
          label="Sedang dikerjakan"
          value={
            ws.invitations.filter((i) => i.service.status === "in_progress")
              .length
          }
          note="Draf dalam proses"
        />
        <Stat
          icon={<Clock3 />}
          label="Menunggu pemeriksaan"
          value={
            ws.invitations.filter((i) => i.service.status === "awaiting_review")
              .length
          }
          note="Persetujuan pasangan"
        />
        <Stat
          icon={<CheckCircle2 />}
          label="Sudah diterbitkan"
          value={ws.invitations.filter((i) => i.status === "published").length}
          note="Kisah siap dibagikan"
        />
      </div>
      <section className="panel">
        <div className="panel-header">
          <h2>Undangan & pekerjaan</h2>
          <span className="badge neutral">Akses sesuai penugasan</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>PASANGAN</th>
                <th>ACARA</th>
                <th>LAYANAN</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ws.invitations.map((i) => (
                <tr key={i.id}>
                  <td>
                    <strong>
                      {i.content.bride.name} & {i.content.groom.name}
                    </strong>
                  </td>
                  <td>{dateLabel(i.content.events[0]?.date || "")}</td>
                  <td>{statusLabel[i.service.status]}</td>
                  <td>
                    <span className="badge green">{statusLabel[i.status]}</span>
                  </td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => navigate("jobs", i.id)}
                    >
                      Kelola <ArrowRight size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
function CreateDialog({
  run,
  busy,
  onClose,
}: {
  run: RunMutation;
  busy: boolean;
  onClose: () => void;
}) {
  useDialogFocus(true, onClose);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" aria-label="Tutup" onClick={onClose}>
          <X size={20} />
        </button>
        <span className="modal-flower">
          <Flower2 size={30} />
        </span>
        <p className="eyebrow">MULAI CERITA BARU</p>
        <h2 id="create-title">Untuk kalian berdua.</h2>
        <p className="muted">
          Isi nama panggilan dahulu. Detail lainnya bisa menyusul.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void run("create", {
              brideName: f.get("bride"),
              groomName: f.get("groom"),
              theme: f.get("theme"),
            });
          }}
        >
          <div className="form-grid">
            <label>
              Nama mempelai pertama
              <input
                name="bride"
                required
                maxLength={40}
                placeholder="Ayu"
                autoFocus
              />
            </label>
            <label>
              Nama mempelai kedua
              <input name="groom" required maxLength={40} placeholder="Bima" />
            </label>
          </div>
          <label>
            Tema awal
            <select name="theme">
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.category}
                </option>
              ))}
            </select>
          </label>
          <button className="btn primary full" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={17} />
            ) : (
              <>
                Mulai merangkai <ArrowRight size={17} />
              </>
            )}
          </button>
        </form>
      </section>
    </div>
  );
}
