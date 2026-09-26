import assert from "node:assert/strict";
import { test } from "node:test";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { hashToken } from "../src/lib/server/crypto";
import { AppError } from "../src/lib/server/errors";
import { createSupabaseMediaAdapter } from "../src/lib/server/supabase-media";
import type { User } from "../src/lib/types";

const invitationId = "11111111-1111-4111-8111-111111111111";
const ownerId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const adminId = "44444444-4444-4444-8444-444444444444";
const assetId = "55555555-5555-4555-8555-555555555555";
const previewToken = "preview-token-" + "x".repeat(40);
const request = {} as NextRequest;
const owner: User = {
  id: ownerId,
  email: "owner@example.test",
  name: "Pemilik",
  role: "owner",
};
const outsider: User = {
  id: otherId,
  email: "other@example.test",
  name: "Lain",
  role: "owner",
};
const assignedAdmin: User = {
  id: adminId,
  email: "admin@example.test",
  name: "Admin",
  role: "admin",
};

function isStatus(status: number) {
  return (error: unknown) =>
    error instanceof AppError && error.status === status;
}

function fixture() {
  const url = `/api/media/${assetId}`;
  const state = {
    id: invitationId,
    ownerId,
    status: "draft",
    previewTokenHash: hashToken(previewToken),
    content: { coverUrl: url, gallery: [] },
    published: undefined as
      undefined | { content: { coverUrl: string; gallery: string[] } },
    entitlement: undefined as
      undefined | { orderId: string; plan: "mandiri"; expiresAt: string },
    assignedAdminId: undefined as undefined | string,
  };
  const invitation = { id: invitationId, owner_id: ownerId, status: "draft" };
  const rows: Record<string, Record<string, unknown>[]> = {
    invitations: [invitation],
    invitation_documents: [{ invitation_id: invitationId, state }],
    invitation_members: [],
    media_assets: [],
    entitlements: [],
  };
  const objects = new Map<string, Uint8Array>();
  const removed: string[] = [];
  let failInsert = false;

  function from(table: string) {
    const filters: Array<[string, unknown]> = [];
    let count = false;
    const query = {
      select(_columns: string, options?: { count?: string; head?: boolean }) {
        count = options?.count === "exact";
        return query;
      },
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return query;
      },
      async maybeSingle() {
        const matches = (rows[table] || []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return { data: matches[0] || null, error: null };
      },
      async insert(value: Record<string, unknown>) {
        if (failInsert) return { data: null, error: { message: "failed" } };
        rows[table].push(value);
        return { data: null, error: null };
      },
      then<T>(resolve: (value: { count: number; error: null }) => T) {
        const matches = (rows[table] || []).filter((row) =>
          filters.every(([column, value]) => row[column] === value),
        );
        return Promise.resolve(
          resolve({ count: count ? matches.length : 0, error: null }),
        );
      },
    };
    return query;
  }

  const admin = {
    from,
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "tamuara-private");
        return {
          async upload(path: string, bytes: Uint8Array) {
            objects.set(path, bytes);
            return { error: null };
          },
          async download(path: string) {
            const bytes = objects.get(path);
            return bytes
              ? { data: new Blob([new Uint8Array(bytes)]), error: null }
              : { data: null, error: { message: "not found" } };
          },
          async remove(paths: string[]) {
            for (const path of paths) {
              removed.push(path);
              objects.delete(path);
            }
            return { error: null };
          },
        };
      },
    },
  } as unknown as SupabaseClient;

  function adapter(user: User | undefined) {
    return createSupabaseMediaAdapter({
      admin,
      getUser: async () => {
        if (!user) throw new AppError(401, "Belum masuk.");
        return user;
      },
    });
  }

  return {
    adapter,
    state,
    invitation,
    rows,
    objects,
    removed,
    setInsertFailure(value: boolean) {
      failInsert = value;
    },
    seedAsset() {
      rows.media_assets.push({
        id: assetId,
        invitation_id: invitationId,
        object_path: `${invitationId}/${assetId}.webp`,
        mime_type: "image/webp",
      });
      objects.set(`${invitationId}/${assetId}.webp`, new Uint8Array([1, 2, 3]));
    },
  };
}

async function image() {
  const bytes = await sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: "#c89183",
    },
  })
    .jpeg()
    .toBuffer();
  return new File([new Uint8Array(bytes)], "foto.jpg", { type: "image/jpeg" });
}

test("media upload checks tenant access and converts the image to WebP", async () => {
  const data = fixture();
  const file = await image();
  await assert.rejects(
    data.adapter(outsider).upload(request, invitationId, file),
    isStatus(404),
  );
  assert.equal(data.objects.size, 0);

  const result = await data.adapter(owner).upload(request, invitationId, file);
  assert.match(result.url, /^\/api\/media\/[a-f0-9-]{36}$/);
  assert.equal(data.rows.media_assets.length, 1);
  const row = data.rows.media_assets[0];
  assert.equal(row.invitation_id, invitationId);
  assert.equal(row.mime_type, "image/webp");
  assert.equal(row.object_path, `${invitationId}/${row.id}.webp`);
  const optimized = data.objects.get(row.object_path as string);
  assert.ok(optimized);
  assert.equal((await sharp(optimized).metadata()).format, "webp");
});

test("draft images require a current preview token or assigned user", async () => {
  const data = fixture();
  data.seedAsset();
  const anonymous = data.adapter(undefined);
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
  assert.deepEqual(
    (await anonymous.read(assetId, request, previewToken)).bytes,
    Buffer.from([1, 2, 3]),
  );
  data.state.previewTokenHash = hashToken(
    "replacement-token-" + "y".repeat(40),
  );
  await assert.rejects(
    anonymous.read(assetId, request, previewToken),
    isStatus(404),
  );
  assert.equal(
    (await data.adapter(owner).read(assetId, request)).mime,
    "image/webp",
  );
  data.state.assignedAdminId = adminId;
  data.rows.invitation_members.push({
    invitation_id: invitationId,
    user_id: adminId,
    role: "assigned_admin",
  });
  assert.equal(
    (await data.adapter(assignedAdmin).read(assetId, request)).mime,
    "image/webp",
  );
  data.rows.invitation_members.length = 0;
  await assert.rejects(
    data.adapter(assignedAdmin).read(assetId, request),
    isStatus(404),
  );
});

test("public images require an active publication that references the asset", async () => {
  const data = fixture();
  data.seedAsset();
  data.state.status = "published";
  data.invitation.status = "published";
  data.state.published = {
    content: { coverUrl: `/api/media/${assetId}`, gallery: [] },
  };
  data.state.entitlement = {
    orderId: "66666666-6666-4666-8666-666666666666",
    plan: "mandiri",
    expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
  };
  const authority = {
    invitation_id: invitationId,
    order_id: data.state.entitlement.orderId,
    expires_at: data.state.entitlement.expiresAt,
    orders: {
      id: data.state.entitlement.orderId,
      invitation_id: invitationId,
      owner_id: ownerId,
      plan_id: "mandiri",
      status: "paid",
      entitlement_expires_at: data.state.entitlement.expiresAt,
    },
    invitations: { id: invitationId, owner_id: ownerId },
  };
  data.rows.entitlements.push(authority);
  const anonymous = data.adapter(undefined);
  assert.equal((await anonymous.read(assetId, request)).mime, "image/webp");
  data.state.published.content.coverUrl = "/images/other.jpg";
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
  data.state.published.content.coverUrl = `/api/media/${assetId}`;
  authority.orders.status = "canceled";
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
  // Private owner and current preview access stay available after revocation.
  assert.equal(
    (await data.adapter(owner).read(assetId, request)).mime,
    "image/webp",
  );
  assert.equal(
    (await anonymous.read(assetId, request, previewToken)).mime,
    "image/webp",
  );
  authority.orders.status = "paid";
  authority.expires_at = new Date(Date.now() - 1_000).toISOString();
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
  authority.expires_at = data.state.entitlement.expiresAt;
  data.state.entitlement.expiresAt = new Date(Date.now() - 1_000).toISOString();
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
  data.rows.entitlements.length = 0;
  await assert.rejects(anonymous.read(assetId, request), isStatus(404));
});

test("failed metadata insert removes the uploaded Storage object", async () => {
  const data = fixture();
  data.setInsertFailure(true);
  await assert.rejects(
    data.adapter(owner).upload(request, invitationId, await image()),
    isStatus(503),
  );
  assert.equal(data.objects.size, 0);
  assert.equal(data.removed.length, 1);
  assert.equal(data.rows.media_assets.length, 0);
});
