import type { User, Mutation, PublicInvitation, Workspace } from "../types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hashToken } from "./crypto";
import { AppError, assert } from "./errors";
import {
  mutatePublicInvitationInStore,
  previewFromStore,
  publicInvitationFromStore,
} from "./public";
import { type MediaAsset, type Store, type StoredInvitation } from "./store";
import { getSupabaseAdmin } from "./supabase-auth";
import { hasActiveSupabaseEntitlement } from "./supabase-entitlement";
import {
  mutateWorkspaceInStore,
  outputWorkspace,
  requireInvitation,
} from "./workspace";

type DocumentRow = {
  invitation_id: string;
  state: StoredInvitation;
  version: number;
};

type MediaRow = {
  id: string;
  invitation_id: string;
  object_path: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
};

type AdapterDependencies = { admin: SupabaseClient; key: string };

function tokenKey() {
  const key = process.env.TAMUARA_TOKEN_ENCRYPTION_KEY;
  assert(
    key && /^[a-fA-F0-9]{64}$/.test(key),
    503,
    "Kunci tautan undangan belum dikonfigurasi.",
    "PRODUCTION_NOT_CONFIGURED",
  );
  return key;
}

function failed(error: { code?: string; message?: string } | null) {
  if (!error) return;
  if (error.code === "23505")
    throw new AppError(
      409,
      "Alamat undangan sudah digunakan.",
      "SLUG_CONFLICT",
    );
  if (
    error.code === "P0001" &&
    error.message?.includes("INVITATION_VERSION_CONFLICT")
  )
    throw new AppError(
      409,
      "Undangan telah diubah. Muat ulang sebelum menyimpan agar perubahan tidak tertimpa.",
      "VERSION_CONFLICT",
    );
  if (error.code === "23503")
    throw new AppError(409, "Data undangan terkait belum tersedia.");
  throw new Error(`Supabase ${error.code || "request"} failed`);
}

function storeFrom(invitations: StoredInvitation[]): Store {
  return {
    schemaVersion: 1,
    users: [],
    sessions: [],
    invitations,
    audit: [],
    media: [],
  };
}

async function loadAccessibleDocuments(
  user: User,
  { admin }: AdapterDependencies,
): Promise<DocumentRow[]> {
  let ids: string[];
  if (user.role === "admin") {
    const result = await admin
      .from("invitation_members")
      .select("invitation_id")
      .eq("user_id", user.id)
      .eq("role", "assigned_admin");
    failed(result.error);
    ids = (result.data || []).map((row) => row.invitation_id);
  } else {
    const result = await admin
      .from("invitations")
      .select("id")
      .eq("owner_id", user.id);
    failed(result.error);
    ids = (result.data || []).map((row) => row.id);
  }
  if (!ids.length) return [];
  const result = await admin
    .from("invitation_documents")
    .select("invitation_id,state,version")
    .in("invitation_id", ids);
  failed(result.error);
  return (result.data || []) as DocumentRow[];
}

async function loadInvitationMedia(
  invitationId: string,
  { admin }: AdapterDependencies,
): Promise<MediaAsset[]> {
  const result = await admin
    .from("media_assets")
    .select("id,invitation_id,object_path,mime_type,size_bytes,created_at")
    .eq("invitation_id", invitationId);
  failed(result.error);
  return ((result.data || []) as MediaRow[]).map((row) => ({
    id: row.id,
    invitationId: row.invitation_id,
    filename: row.object_path,
    mime: row.mime_type,
    size: row.size_bytes,
    createdAt: row.created_at,
  }));
}

async function commitDocument(
  invitation: StoredInvitation,
  expectedVersion: number,
  actorId: string | null,
  action: string,
  { admin }: AdapterDependencies,
) {
  const result = await admin.rpc("commit_invitation_document", {
    p_invitation_id: invitation.id,
    p_expected_version: expectedVersion,
    p_state: invitation,
    p_actor_id: actorId,
    p_action: action,
  });
  failed(result.error);
  assert(typeof result.data === "number", 500, "Penyimpanan undangan gagal.");
}

async function workspace(
  user: User,
  deps: AdapterDependencies,
): Promise<Workspace> {
  const rows = await loadAccessibleDocuments(user, deps);
  const store = storeFrom(rows.map((row) => row.state));
  return { ...outputWorkspace(store, user, deps.key), mode: "supabase" };
}

async function mutateWorkspace(
  user: User,
  input: Mutation,
  deps: AdapterDependencies,
): Promise<Workspace> {
  if (input.action === "checkout" || input.action === "demoPay")
    throw new AppError(
      503,
      "Pembayaran produksi belum tersedia. Checkout akan dibuka setelah akun merchant terhubung.",
      "PAYMENT_NOT_CONFIGURED",
    );
  const rows = await loadAccessibleDocuments(user, deps);
  const store = storeFrom(rows.map((row) => structuredClone(row.state)));
  if (input.action === "save") {
    const invitation = requireInvitation(store, input.invitationId, user);
    store.media = await loadInvitationMedia(invitation.id, deps);
  }
  if (input.action === "publish") {
    const invitation = requireInvitation(store, input.invitationId, user);
    assert(
      invitation.ownerId === user.id,
      403,
      "Tindakan ini hanya dapat dilakukan pemilik undangan.",
    );
    assert(
      await hasActiveSupabaseEntitlement(deps.admin, invitation),
      402,
      "Aktifkan paket undangan sebelum menerbitkan.",
      "PAYMENT_REQUIRED",
    );
  }
  mutateWorkspaceInStore(store, user, deps.key, input);
  const changed =
    input.action === "create"
      ? store.invitations.find(
          (entry) => !rows.some((row) => row.invitation_id === entry.id),
        )
      : store.invitations.find((entry) => entry.id === input.invitationId);
  assert(changed, 404, "Undangan tidak ditemukan.");
  const original = rows.find((row) => row.invitation_id === changed.id);
  if (!original || JSON.stringify(original.state) !== JSON.stringify(changed))
    await commitDocument(
      changed,
      original?.version ?? 0,
      user.id,
      `invitation.${input.action.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}`,
      deps,
    );
  return workspace(user, deps);
}

async function documentBySlug(
  slug: string,
  { admin }: AdapterDependencies,
): Promise<DocumentRow> {
  const metadata = await admin
    .from("invitations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  failed(metadata.error);
  assert(metadata.data, 404, "Undangan belum terbit atau sudah tidak aktif.");
  const result = await admin
    .from("invitation_documents")
    .select("invitation_id,state,version")
    .eq("invitation_id", metadata.data.id)
    .maybeSingle();
  failed(result.error);
  assert(result.data, 404, "Undangan belum terbit atau sudah tidak aktif.");
  return result.data as DocumentRow;
}

async function publicInvitation(
  slug: string,
  deps: AdapterDependencies,
  guestToken?: string,
): Promise<PublicInvitation> {
  const row = await documentBySlug(slug, deps);
  assert(
    await hasActiveSupabaseEntitlement(deps.admin, row.state),
    404,
    "Undangan belum terbit atau sudah tidak aktif.",
  );
  return {
    ...publicInvitationFromStore(storeFrom([row.state]), slug, guestToken),
    mode: "supabase",
  };
}

async function preview(
  token: string,
  { admin }: AdapterDependencies,
): Promise<PublicInvitation> {
  assert(
    token.length >= 32 && token.length <= 100,
    404,
    "Pratinjau tidak ditemukan.",
  );
  const result = await admin
    .from("invitation_documents")
    .select("invitation_id,state,version")
    .eq("preview_token_hash", hashToken(token))
    .maybeSingle();
  failed(result.error);
  assert(result.data, 404, "Pratinjau tidak ditemukan.");
  return {
    ...previewFromStore(storeFrom([(result.data as DocumentRow).state]), token),
    mode: "supabase",
  };
}

async function mutatePublicInvitation(
  slug: string,
  input: Record<string, unknown>,
  deps: AdapterDependencies,
): Promise<PublicInvitation> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await documentBySlug(slug, deps);
    assert(
      await hasActiveSupabaseEntitlement(deps.admin, row.state),
      404,
      "Undangan belum terbit atau sudah tidak aktif.",
    );
    const store = storeFrom([structuredClone(row.state)]);
    const output = mutatePublicInvitationInStore(store, slug, input);
    if (JSON.stringify(row.state) === JSON.stringify(store.invitations[0]))
      return { ...output, mode: "supabase" };
    try {
      await commitDocument(
        store.invitations[0],
        row.version,
        null,
        `public.${String(input.action || "unknown")}`,
        deps,
      );
      return { ...output, mode: "supabase" };
    } catch (error) {
      if (
        error instanceof AppError &&
        error.code === "VERSION_CONFLICT" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
  throw new AppError(409, "Undangan sedang diperbarui. Coba lagi sebentar.");
}

/** Injectable adapter keeps service-role queries testable without external keys. */
export function createSupabaseWorkspaceAdapter(deps: AdapterDependencies) {
  return {
    getWorkspace: (user: User) => workspace(user, deps),
    mutateWorkspace: (user: User, input: Mutation) =>
      mutateWorkspace(user, input, deps),
    getPublicInvitation: (slug: string, guestToken?: string) =>
      publicInvitation(slug, deps, guestToken),
    getPreview: (token: string) => preview(token, deps),
    mutatePublicInvitation: (slug: string, input: Record<string, unknown>) =>
      mutatePublicInvitation(slug, input, deps),
  };
}

function liveAdapter() {
  return createSupabaseWorkspaceAdapter({
    admin: getSupabaseAdmin(),
    key: tokenKey(),
  });
}

export const getSupabaseWorkspace = (user: User) =>
  liveAdapter().getWorkspace(user);
export const mutateSupabaseWorkspace = (user: User, input: Mutation) =>
  liveAdapter().mutateWorkspace(user, input);
export const getSupabasePublicInvitation = (
  slug: string,
  guestToken?: string,
) => liveAdapter().getPublicInvitation(slug, guestToken);
export const getSupabasePreview = (token: string) =>
  liveAdapter().getPreview(token);
export const mutateSupabasePublicInvitation = (
  slug: string,
  input: Record<string, unknown>,
) => liveAdapter().mutatePublicInvitation(slug, input);
