import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import type { InvitationContent, User } from "../types";
import type { StoredInvitation } from "./store";
import { hashToken } from "./crypto";
import { AppError, assert } from "./errors";
import { getSupabaseAdmin, getSupabaseUser } from "./supabase-auth";
import { hasActiveSupabaseEntitlement } from "./supabase-entitlement";

const BUCKET = "tamuara-private";
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const MAX_ASSETS_PER_INVITATION = 60;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

interface MediaDependencies {
  admin: SupabaseClient;
  getUser: (request: NextRequest) => Promise<User>;
}

interface InvitationRow {
  id: string;
  owner_id: string;
  status: "draft" | "published" | "archived";
}

interface MediaRow {
  id: string;
  invitation_id: string;
  object_path: string;
  mime_type: string;
}

function databaseAvailable(error: unknown) {
  if (error)
    throw new AppError(503, "Penyimpanan undangan sedang tidak tersedia.");
}

async function loadInvitation(admin: SupabaseClient, invitationId: string) {
  const invitationResult = await admin
    .from("invitations")
    .select("id,owner_id,status")
    .eq("id", invitationId)
    .maybeSingle();
  databaseAvailable(invitationResult.error);
  const invitation = invitationResult.data as InvitationRow | null;
  assert(invitation, 404, "Undangan tidak ditemukan.");

  const documentResult = await admin
    .from("invitation_documents")
    .select("state")
    .eq("invitation_id", invitationId)
    .maybeSingle();
  databaseAvailable(documentResult.error);
  const state = documentResult.data?.state as StoredInvitation | undefined;
  assert(
    state &&
      state.id === invitation.id &&
      state.ownerId === invitation.owner_id,
    404,
    "Undangan tidak ditemukan.",
  );
  return { invitation, state };
}

async function canEdit(
  admin: SupabaseClient,
  invitation: InvitationRow,
  state: StoredInvitation,
  user: User,
) {
  if (invitation.owner_id === user.id) return true;
  if (user.role !== "admin" || state.assignedAdminId !== user.id) return false;
  const membershipResult = await admin
    .from("invitation_members")
    .select("role")
    .eq("invitation_id", invitation.id)
    .eq("user_id", user.id)
    .maybeSingle();
  databaseAvailable(membershipResult.error);
  return membershipResult.data?.role === "assigned_admin";
}

function referenced(content: InvitationContent | undefined, url: string) {
  return (
    !!content &&
    (content.coverUrl === url ||
      (Array.isArray(content.gallery) && content.gallery.includes(url)))
  );
}

function activePublication(invitation: InvitationRow, state: StoredInvitation) {
  return (
    invitation.status === "published" &&
    state.status === "published" &&
    !!state.published &&
    !!state.entitlement &&
    new Date(state.entitlement.expiresAt).getTime() > Date.now()
  );
}

async function optimizeImage(file: File) {
  assert(
    file.size > 0 && file.size <= MAX_INPUT_BYTES,
    400,
    "Ukuran gambar maksimal 8 MB.",
  );
  assert(
    ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    400,
    "Gunakan gambar JPG, PNG, atau WebP.",
  );
  try {
    const pipeline = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const metadata = await pipeline.metadata();
    assert(
      metadata.format && ["jpeg", "png", "webp"].includes(metadata.format),
      400,
      "Format gambar tidak didukung.",
    );
    return await pipeline
      .rotate()
      .resize(2000, 2000, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new AppError(
      400,
      "Gambar tidak dapat diproses. Gunakan file JPG, PNG, atau WebP yang valid.",
    );
  }
}

// Kept injectable so permission checks and storage cleanup can be tested without credentials.
export function createSupabaseMediaAdapter({
  admin,
  getUser,
}: MediaDependencies) {
  return {
    async upload(request: NextRequest, invitationId: string, file: File) {
      assert(UUID.test(invitationId), 404, "Undangan tidak ditemukan.");
      const user = await getUser(request);
      const { invitation, state } = await loadInvitation(admin, invitationId);
      assert(
        invitation.status !== "archived" &&
          state.status !== "archived" &&
          (await canEdit(admin, invitation, state, user)),
        404,
        "Undangan tidak ditemukan.",
      );

      const countResult = await admin
        .from("media_assets")
        .select("id", { count: "exact", head: true })
        .eq("invitation_id", invitationId);
      databaseAvailable(countResult.error);
      assert(
        (countResult.count ?? MAX_ASSETS_PER_INVITATION) <
          MAX_ASSETS_PER_INVITATION,
        400,
        "Batas 60 unggahan pada undangan tercapai.",
      );

      const bytes = await optimizeImage(file);
      const id = randomUUID();
      const objectPath = `${invitationId}/${id}.webp`;
      const bucket = admin.storage.from(BUCKET);
      const uploaded = await bucket.upload(objectPath, bytes, {
        contentType: "image/webp",
        cacheControl: "0",
        upsert: false,
      });
      if (uploaded.error)
        throw new AppError(503, "Gambar tidak dapat diunggah. Coba lagi.");

      const saved = await admin.from("media_assets").insert({
        id,
        invitation_id: invitationId,
        object_path: objectPath,
        mime_type: "image/webp",
        size_bytes: bytes.byteLength,
      });
      if (saved.error) {
        // The Storage API must remove objects; deleting its SQL metadata leaves orphans.
        await bucket.remove([objectPath]);
        throw new AppError(503, "Gambar tidak dapat disimpan. Coba lagi.");
      }
      return { url: `/api/media/${id}` };
    },

    async read(id: string, request: NextRequest, preview?: string) {
      assert(UUID.test(id), 404, "Gambar tidak ditemukan.");
      const assetResult = await admin
        .from("media_assets")
        .select("id,invitation_id,object_path,mime_type")
        .eq("id", id)
        .maybeSingle();
      databaseAvailable(assetResult.error);
      const asset = assetResult.data as MediaRow | null;
      assert(asset, 404, "Gambar tidak ditemukan.");
      assert(
        asset.object_path === `${asset.invitation_id}/${id}.webp` &&
          asset.mime_type === "image/webp",
        404,
        "Gambar tidak ditemukan.",
      );
      const { invitation, state } = await loadInvitation(
        admin,
        asset.invitation_id,
      );
      const url = `/api/media/${id}`;
      let allowed =
        activePublication(invitation, state) &&
        referenced(state.published?.content, url) &&
        (await hasActiveSupabaseEntitlement(admin, state));

      if (
        !allowed &&
        preview &&
        preview.length >= 32 &&
        preview.length <= 100 &&
        invitation.status !== "archived" &&
        state.status !== "archived" &&
        state.previewTokenHash === hashToken(preview) &&
        referenced(state.content, url)
      )
        allowed = true;

      if (!allowed) {
        try {
          const user = await getUser(request);
          allowed = await canEdit(admin, invitation, state, user);
        } catch (error) {
          if (
            !(error instanceof AppError) ||
            (error.status !== 401 && error.status !== 403)
          )
            throw error;
        }
      }
      assert(allowed, 404, "Gambar tidak ditemukan.");

      const downloaded = await admin.storage
        .from(BUCKET)
        .download(asset.object_path, {}, { cache: "no-store" });
      if (downloaded.error || !downloaded.data)
        throw new AppError(503, "Gambar sementara tidak tersedia.");
      return {
        bytes: Buffer.from(await downloaded.data.arrayBuffer()),
        mime: asset.mime_type,
      };
    },
  };
}

export async function uploadSupabaseMedia(
  request: NextRequest,
  invitationId: string,
  file: File,
  getUser: (request: NextRequest) => Promise<User> = getSupabaseUser,
) {
  return createSupabaseMediaAdapter({
    admin: getSupabaseAdmin(),
    getUser,
  }).upload(request, invitationId, file);
}

export async function readSupabaseMedia(
  id: string,
  request: NextRequest,
  preview?: string,
  getUser: (request: NextRequest) => Promise<User> = getSupabaseUser,
) {
  return createSupabaseMediaAdapter({
    admin: getSupabaseAdmin(),
    getUser,
  }).read(id, request, preview);
}
