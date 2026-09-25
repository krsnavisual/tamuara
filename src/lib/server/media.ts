import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { requireUser } from "./auth";
import { hashToken } from "./crypto";
import { AppError, assert } from "./errors";
import { isPublic } from "./public";
import { audit, withStore } from "./store";
import { canAccess, requireInvitation } from "./workspace";

export async function uploadMedia(
  session: string | undefined,
  invitationId: string,
  file: File,
) {
  assert(
    file.size > 0 && file.size <= 8 * 1024 * 1024,
    400,
    "Ukuran gambar maksimal 8 MB.",
  );
  assert(
    ["image/jpeg", "image/png", "image/webp"].includes(file.type),
    400,
    "Gunakan gambar JPG, PNG, atau WebP.",
  );
  await withStore(({ store }) => {
    requireInvitation(store, invitationId, requireUser(store, session));
  }, false);
  const bytes = Buffer.from(await file.arrayBuffer());
  let result: Buffer;
  try {
    const pipeline = sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const metadata = await pipeline.metadata();
    assert(
      metadata.format && ["jpeg", "png", "webp"].includes(metadata.format),
      400,
      "Format gambar tidak didukung.",
    );
    result = await pipeline
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
  return withStore(async ({ store, directory }) => {
    const user = requireUser(store, session);
    requireInvitation(store, invitationId, user);
    assert(
      store.media.filter((asset) => asset.invitationId === invitationId)
        .length < 60,
      400,
      "Batas 60 unggahan pada undangan pengembangan tercapai.",
    );
    const id = randomUUID();
    const filename = `${id}.webp`;
    await fs.mkdir(path.join(directory, "media"), { recursive: true });
    await fs.writeFile(path.join(directory, "media", filename), result, {
      flag: "wx",
      mode: 0o600,
    });
    store.media.push({
      id,
      invitationId,
      filename,
      mime: "image/webp",
      size: result.byteLength,
      createdAt: new Date().toISOString(),
    });
    audit(store, invitationId, user.id, "media.uploaded", id);
    return { url: `/api/media/${id}` };
  });
}

export async function readMedia(
  id: string,
  session?: string,
  preview?: string,
) {
  assert(/^[a-f0-9-]{36}$/.test(id), 404, "Gambar tidak ditemukan.");
  return withStore(async ({ store, directory }) => {
    const asset = store.media.find((entry) => entry.id === id);
    const invitation =
      asset &&
      store.invitations.find((entry) => entry.id === asset.invitationId);
    assert(asset && invitation, 404, "Gambar tidak ditemukan.");
    const url = `/api/media/${id}`;
    const content = invitation.published?.content;
    let allowed =
      isPublic(invitation) &&
      !!content &&
      (content.coverUrl === url || content.gallery.includes(url));
    if (
      !allowed &&
      preview &&
      preview.length <= 100 &&
      invitation.status !== "archived"
    )
      allowed = invitation.previewTokenHash === hashToken(preview);
    if (!allowed && session) {
      try {
        allowed = canAccess(invitation, requireUser(store, session));
      } catch {
        /* Private assets stay indistinguishable from missing assets. */
      }
    }
    assert(allowed, 404, "Gambar tidak ditemukan.");
    const bytes = await fs.readFile(
      path.join(directory, "media", asset.filename),
    );
    return { bytes, mime: asset.mime };
  }, false);
}
