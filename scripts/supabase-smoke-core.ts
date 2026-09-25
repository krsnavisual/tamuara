/** Integration smoke shared by the separately guarded local and remote runners. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import sharp from "sharp";
import type { Invitation, User, Workspace } from "../src/lib/types";

export type SmokeCredentials = {
  url: string;
  publishableKey: string;
  secretKey: string;
};
type Cookie = { name: string; value: string };
const mediaBucket = "tamuara-private";

function request(
  path: string,
  method: "GET" | "POST",
  body?: Record<string, unknown>,
  cookies: Cookie[] = [],
) {
  const origin = "http://127.0.0.1:3001";
  const headers: Record<string, string> = { origin };
  if (body) headers["content-type"] = "application/json";
  const result = new NextRequest(`${origin}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const cookie of cookies) result.cookies.set(cookie.name, cookie.value);
  return result;
}

function uploadRequest(
  invitationId: string,
  image: Uint8Array,
  cookies: Cookie[],
) {
  const form = new FormData();
  form.set("invitationId", invitationId);
  form.set(
    "file",
    new File([new Uint8Array(image)], "smoke.png", { type: "image/png" }),
  );
  const result = new NextRequest("http://127.0.0.1:3001/api/media", {
    method: "POST",
    headers: { origin: "http://127.0.0.1:3001" },
    body: form,
  });
  for (const cookie of cookies) result.cookies.set(cookie.name, cookie.value);
  return result;
}

export async function runSupabaseSmoke(
  { url, publishableKey, secretKey }: SmokeCredentials,
  target: "Local" | "Remote",
) {
  let step = "configure smoke client";
  process.env.TAMUARA_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  process.env.SUPABASE_SECRET_KEY = secretKey;
  if (target === "Local") {
    process.env.TAMUARA_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  } else {
    assert.match(
      process.env.TAMUARA_TOKEN_ENCRYPTION_KEY || "",
      /^[a-fA-F0-9]{64}$/,
      "Remote token encryption key is missing or invalid",
    );
  }
  process.env.TAMUARA_APP_URL = "http://127.0.0.1:3001";

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { POST: authPost } = await import("../src/app/api/auth/route");
  const { GET: workspaceGet, POST: workspacePost } =
    await import("../src/app/api/workspace/route");
  const { POST: mediaPost } = await import("../src/app/api/media/route");
  const { GET: mediaGet } = await import("../src/app/api/media/[id]/route");
  const { GET: previewGet } =
    await import("../src/app/api/preview/[token]/route");
  const { GET: assistanceGet, POST: assistancePost } =
    await import("../src/app/api/admin/assistance/route");
  const suffix = randomUUID().slice(0, 12);
  const password = `TamuaraSmoke!${randomBytes(12).toString("hex")}`;
  const identities: Array<{ id: string; email: string; name: string }> = [];
  const attemptedEmails = new Set<string>();
  let invitationId: string | undefined;
  let mediaId: string | undefined;
  let failure: unknown;

  async function findSyntheticAuthUserIds() {
    const found = new Set<string>();
    const perPage = 100;
    for (let page = 1; page <= 100; page++) {
      const listed = await admin.auth.admin.listUsers({ page, perPage });
      assert.ifError(listed.error);
      for (const user of listed.data.users) {
        if (user.email && attemptedEmails.has(user.email.toLowerCase())) {
          found.add(user.id);
        }
      }
      if (listed.data.users.length < perPage) return found;
    }
    throw new Error("Could not scan all Auth users for synthetic accounts");
  }

  try {
    step = "create synthetic Auth accounts";
    for (const label of ["A", "B", "Admin"]) {
      const email = `smoke-${suffix}-${label.toLowerCase()}@example.test`;
      const name = `Smoke Owner ${label}`;
      attemptedEmails.add(email);
      const result = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      assert.ifError(result.error);
      assert.ok(result.data.user?.id);
      identities.push({ id: result.data.user.id, email, name });

      step = `verify profile ${label}`;
      const profile = await admin
        .from("profiles")
        .select("display_name,role")
        .eq("id", result.data.user.id)
        .single();
      assert.ifError(profile.error);
      assert.deepEqual(profile.data, { display_name: name, role: "owner" });
    }

    step = "promote synthetic admin role";
    const promoted = await admin
      .from("profiles")
      .update({ role: "admin" })
      .eq("id", identities[2].id);
    assert.ifError(promoted.error);

    async function login(identity: (typeof identities)[number]) {
      const response = await authPost(
        request("/api/auth", "POST", {
          action: "login",
          email: identity.email,
          password,
        }),
      );
      assert.equal(response.status, 200, "App login failed");
      const payload = (await response.json()) as { user: User; mode: string };
      assert.equal(payload.mode, "supabase");
      assert.equal(payload.user.id, identity.id);
      assert.equal(payload.user.name, identity.name);
      const cookies = response.cookies.getAll().map(({ name, value }) => ({
        name,
        value,
      }));
      assert.ok(cookies.length, "App login did not return a session cookie");
      return cookies;
    }

    step = "log in through app route";
    const ownerACookies = await login(identities[0]);
    const ownerBCookies = await login(identities[1]);
    const adminCookies = await login(identities[2]);

    step = "create draft through workspace route";
    const create = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "create",
          payload: {
            brideName: `Ayu ${suffix}`,
            groomName: `Bima ${suffix}`,
            theme: "classic",
          },
        },
        ownerACookies,
      ),
    );
    assert.equal(create.status, 200, "App draft creation failed");
    const created = (await create.json()) as Workspace;
    assert.equal(created.mode, "supabase");
    assert.equal(created.invitations.length, 1);
    const invitation: Invitation = created.invitations[0];
    invitationId = invitation.id;
    assert.equal(invitation.ownerId, identities[0].id);
    assert.equal(invitation.status, "draft");

    step = "verify persisted document and audit";
    const document = await admin
      .from("invitation_documents")
      .select("version")
      .eq("invitation_id", invitationId)
      .single();
    assert.ifError(document.error);
    assert.equal(document.data.version, 1);
    const audit = await admin
      .from("audit_logs")
      .select("actor_id,action")
      .eq("invitation_id", invitationId)
      .single();
    assert.ifError(audit.error);
    assert.deepEqual(audit.data, {
      actor_id: identities[0].id,
      action: "invitation.create",
    });

    step = "verify tenant isolation through workspace route";
    const ownerAResponse = await workspaceGet(
      request("/api/workspace", "GET", undefined, ownerACookies),
    );
    assert.equal(ownerAResponse.status, 200);
    assert.equal(
      ((await ownerAResponse.json()) as Workspace).invitations[0].id,
      invitationId,
    );
    const ownerBResponse = await workspaceGet(
      request("/api/workspace", "GET", undefined, ownerBCookies),
    );
    assert.equal(ownerBResponse.status, 200);
    assert.deepEqual(
      ((await ownerBResponse.json()) as Workspace).invitations,
      [],
    );
    const denied = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        { action: "archive", invitationId },
        ownerBCookies,
      ),
    );
    assert.equal(denied.status, 404, "Other owner mutated the draft");

    const image = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "#bb7f68" },
    })
      .png()
      .toBuffer();
    step = "deny unauthorized media uploads";
    const anonymousUpload = await mediaPost(
      uploadRequest(invitationId, image, []),
    );
    assert.equal(
      anonymousUpload.status,
      401,
      "Anonymous media upload was allowed",
    );
    const otherOwnerUpload = await mediaPost(
      uploadRequest(invitationId, image, ownerBCookies),
    );
    assert.equal(otherOwnerUpload.status, 404, "Other owner uploaded media");

    step = "upload private media through app route";
    const uploaded = await mediaPost(
      uploadRequest(invitationId, image, ownerACookies),
    );
    assert.equal(uploaded.status, 200, "Owner media upload failed");
    const mediaUrl = (await uploaded.json()) as { url: string };
    assert.match(mediaUrl.url, /^\/api\/media\/[a-f0-9-]{36}$/);
    mediaId = mediaUrl.url.slice("/api/media/".length);
    const mediaContext = { params: Promise.resolve({ id: mediaId }) };
    const mediaAsset = await admin
      .from("media_assets")
      .select("invitation_id,object_path,mime_type")
      .eq("id", mediaId)
      .single();
    assert.ifError(mediaAsset.error);
    assert.deepEqual(mediaAsset.data, {
      invitation_id: invitationId,
      object_path: `${invitationId}/${mediaId}.webp`,
      mime_type: "image/webp",
    });

    step = "deny draft media reads without owner access";
    const anonymousRead = await mediaGet(
      request(mediaUrl.url, "GET"),
      mediaContext,
    );
    assert.equal(
      anonymousRead.status,
      404,
      "Anonymous draft media read was allowed",
    );
    const otherOwnerRead = await mediaGet(
      request(mediaUrl.url, "GET", undefined, ownerBCookies),
      mediaContext,
    );
    assert.equal(otherOwnerRead.status, 404, "Other owner read draft media");
    const ownerRead = await mediaGet(
      request(mediaUrl.url, "GET", undefined, ownerACookies),
      mediaContext,
    );
    assert.equal(ownerRead.status, 200, "Owner could not read private media");
    assert.equal(ownerRead.headers.get("content-type"), "image/webp");
    assert.equal(ownerRead.headers.get("cache-control"), "private, no-store");
    assert.equal(
      (await sharp(Buffer.from(await ownerRead.arrayBuffer())).metadata())
        .format,
      "webp",
    );

    step = "save uploaded media in invitation draft";
    const saved = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "save",
          invitationId,
          version: invitation.version,
          payload: {
            content: { ...invitation.content, coverUrl: mediaUrl.url },
            theme: invitation.theme,
            slug: invitation.slug,
          },
        },
        ownerACookies,
      ),
    );
    assert.equal(
      saved.status,
      200,
      "App draft save with uploaded media failed",
    );
    const savedInvitation = ((await saved.json()) as Workspace).invitations[0];
    assert.equal(savedInvitation.content.coverUrl, mediaUrl.url);
    const storedDocument = await admin
      .from("invitation_documents")
      .select("state")
      .eq("invitation_id", invitationId)
      .single();
    assert.ifError(storedDocument.error);
    assert.equal(storedDocument.data.state.content.coverUrl, mediaUrl.url);
    const anonymousDraftRead = await mediaGet(
      request(mediaUrl.url, "GET"),
      mediaContext,
    );
    assert.equal(
      anonymousDraftRead.status,
      404,
      "Anonymous reader saw saved draft media without preview token",
    );

    step = "read draft and media through preview token";
    const oldToken = savedInvitation.previewToken;
    const oldPreview = await previewGet(
      request(`/api/preview/${oldToken}`, "GET"),
      { params: Promise.resolve({ token: oldToken }) },
    );
    assert.equal(oldPreview.status, 200, "Preview token did not open draft");
    const oldPreviewPayload = await oldPreview.json();
    assert.equal(oldPreviewPayload.preview, true);
    assert.equal(
      oldPreviewPayload.content.coverUrl,
      `${mediaUrl.url}?preview=${encodeURIComponent(oldToken)}`,
    );
    const previewRead = await mediaGet(
      request(`${mediaUrl.url}?preview=${encodeURIComponent(oldToken)}`, "GET"),
      mediaContext,
    );
    assert.equal(
      previewRead.status,
      200,
      "Preview token did not open draft media",
    );
    assert.equal(previewRead.headers.get("content-type"), "image/webp");

    step = "rotate preview token and reject old token";
    const rotated = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "regeneratePreview",
          invitationId,
          version: savedInvitation.version,
        },
        ownerACookies,
      ),
    );
    assert.equal(rotated.status, 200, "Preview token rotation failed");
    const newToken = ((await rotated.json()) as Workspace).invitations[0]
      .previewToken;
    assert.notEqual(newToken, oldToken);
    const revokedPreview = await previewGet(
      request(`/api/preview/${oldToken}`, "GET"),
      { params: Promise.resolve({ token: oldToken }) },
    );
    assert.equal(
      revokedPreview.status,
      404,
      "Old preview token still opens draft",
    );
    const revokedMedia = await mediaGet(
      request(`${mediaUrl.url}?preview=${encodeURIComponent(oldToken)}`, "GET"),
      mediaContext,
    );
    assert.equal(
      revokedMedia.status,
      404,
      "Old preview token still opens media",
    );
    const renewedPreview = await previewGet(
      request(`/api/preview/${newToken}`, "GET"),
      { params: Promise.resolve({ token: newToken }) },
    );
    assert.equal(
      renewedPreview.status,
      200,
      "New preview token did not open draft",
    );
    const renewedMedia = await mediaGet(
      request(`${mediaUrl.url}?preview=${encodeURIComponent(newToken)}`, "GET"),
      mediaContext,
    );
    assert.equal(
      renewedMedia.status,
      200,
      "New preview token did not open media",
    );

    step = "verify unassigned admin has no invitation access";
    const beforeClaim = await workspaceGet(
      request("/api/workspace", "GET", undefined, adminCookies),
    );
    assert.equal(beforeClaim.status, 200);
    assert.deepEqual(
      ((await beforeClaim.json()) as Workspace).invitations,
      [],
    );

    step = "prepare synthetic paid assisted entitlement";
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString();
    const order = await admin
      .from("orders")
      .insert({
        invitation_id: invitationId,
        owner_id: identities[0].id,
        plan_id: "assisted",
        amount_idr: 599_000,
        status: "paid",
        plan_snapshot: { guestLimit: 500, photoLimit: 20, maxRevisions: 2 },
        entitlement_expires_at: expiresAt,
        paid_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    assert.ifError(order.error);
    const entitlement = await admin.from("entitlements").insert({
      invitation_id: invitationId,
      order_id: order.data.id,
      plan_snapshot: { guestLimit: 500, photoLimit: 20, maxRevisions: 2 },
      expires_at: expiresAt,
    });
    assert.ifError(entitlement.error);
    const currentDocument = await admin
      .from("invitation_documents")
      .select("state,version")
      .eq("invitation_id", invitationId)
      .single();
    assert.ifError(currentDocument.error);
    const nextState = {
      ...currentDocument.data.state,
      entitlement: {
        orderId: order.data.id,
        plan: "assisted",
        guestLimit: 500,
        photoLimit: 20,
        maxRevisions: 2,
        expiresAt,
      },
      expiresAt,
    };
    const activated = await admin.rpc("commit_invitation_document", {
      p_invitation_id: invitationId,
      p_expected_version: currentDocument.data.version,
      p_state: nextState,
      p_actor_id: identities[0].id,
      p_action: "smoke.activate_assisted",
    });
    assert.ifError(activated.error);

    step = "submit paid assistance request";
    const submitted = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "requestAssistance",
          invitationId,
          payload: { brief: "Contoh permintaan bantuan sintetis" },
        },
        ownerACookies,
      ),
    );
    assert.equal(submitted.status, 200, "Owner assistance request failed");
    assert.equal(
      ((await submitted.json()) as Workspace).invitations[0].service.status,
      "submitted",
    );

    step = "verify queue is admin-only and excludes private brief";
    const ownerQueue = await assistanceGet(
      request("/api/admin/assistance", "GET", undefined, ownerACookies),
    );
    assert.equal(ownerQueue.status, 403, "Owner read admin queue");
    const anonymousQueue = await assistanceGet(
      request("/api/admin/assistance", "GET"),
    );
    assert.equal(anonymousQueue.status, 401, "Anonymous user read admin queue");
    const queued = await assistanceGet(
      request("/api/admin/assistance", "GET", undefined, adminCookies),
    );
    assert.equal(queued.status, 200, "Admin could not read assistance queue");
    const queue = (await queued.json()) as {
      requests: Array<{
        invitationId: string;
        documentVersion: number;
        updatedAt: string;
      }>;
    };
    assert.equal(queue.requests.length, 1);
    assert.equal(queue.requests[0].invitationId, invitationId);
    assert.deepEqual(Object.keys(queue.requests[0]).sort(), [
      "documentVersion",
      "invitationId",
      "updatedAt",
    ]);

    step = "reject stale admin claim and accept current version";
    const staleClaim = await assistancePost(
      request(
        "/api/admin/assistance",
        "POST",
        {
          invitationId,
          expectedVersion: queue.requests[0].documentVersion + 1,
        },
        adminCookies,
      ),
    );
    assert.equal(staleClaim.status, 409, "Stale claim was accepted");
    const ownerClaim = await assistancePost(
      request(
        "/api/admin/assistance",
        "POST",
        {
          invitationId,
          expectedVersion: queue.requests[0].documentVersion,
        },
        ownerACookies,
      ),
    );
    assert.equal(ownerClaim.status, 403, "Owner claimed assistance");
    const claimed = await assistancePost(
      request(
        "/api/admin/assistance",
        "POST",
        {
          invitationId,
          expectedVersion: queue.requests[0].documentVersion,
        },
        adminCookies,
      ),
    );
    assert.equal(claimed.status, 200, "Admin claim failed");
    const secondClaim = await assistancePost(
      request(
        "/api/admin/assistance",
        "POST",
        {
          invitationId,
          expectedVersion: queue.requests[0].documentVersion,
        },
        adminCookies,
      ),
    );
    assert.equal(secondClaim.status, 409, "Already claimed request was accepted");
    const emptyQueue = await assistanceGet(
      request("/api/admin/assistance", "GET", undefined, adminCookies),
    );
    assert.equal(emptyQueue.status, 200);
    assert.deepEqual((await emptyQueue.json()).requests, []);

    step = "verify assigned admin can progress service and owner cannot reset it";
    const assignedWorkspace = await workspaceGet(
      request("/api/workspace", "GET", undefined, adminCookies),
    );
    assert.equal(assignedWorkspace.status, 200);
    const assignedInvitation = ((await assignedWorkspace.json()) as Workspace)
      .invitations[0];
    assert.equal(assignedInvitation.id, invitationId);
    assert.equal(assignedInvitation.assignedAdminId, identities[2].id);
    const progress = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "updateService",
          invitationId,
          payload: { status: "in_progress" },
        },
        adminCookies,
      ),
    );
    assert.equal(progress.status, 200, "Assigned admin could not progress service");
    const repeatRequest = await workspacePost(
      request(
        "/api/workspace",
        "POST",
        {
          action: "requestAssistance",
          invitationId,
          payload: { brief: "Mencoba mengulang permintaan" },
        },
        ownerACookies,
      ),
    );
    assert.equal(repeatRequest.status, 409, "Owner reset in-progress assistance");

    step = "verify media proxy and direct Storage isolation after admin claim";
    const directAdmin = createClient(url, publishableKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const directLogin = await directAdmin.auth.signInWithPassword({
      email: identities[2].email,
      password,
    });
    assert.ifError(directLogin.error);
    const assignedRows = await directAdmin
      .from("invitations")
      .select("id")
      .eq("id", invitationId);
    assert.ifError(assignedRows.error);
    assert.equal(assignedRows.data?.length, 1);
    const assignedMediaViaApp = await mediaGet(
      request(mediaUrl.url, "GET", undefined, adminCookies),
      mediaContext,
    );
    assert.equal(assignedMediaViaApp.status, 200);
    const directMedia = await directAdmin.storage
      .from(mediaBucket)
      .download(mediaAsset.data.object_path, { cacheNonce: randomUUID() }, { cache: "no-store" });
    assert.ok(directMedia.error, "Direct Storage download bypassed app media proxy");

    step = "verify demotion revokes app and direct Supabase access";
    const demoted = await admin
      .from("profiles")
      .update({ role: "owner" })
      .eq("id", identities[2].id);
    assert.ifError(demoted.error);
    const deniedRows = await directAdmin
      .from("invitations")
      .select("id")
      .eq("id", invitationId);
    assert.ifError(deniedRows.error);
    assert.deepEqual(deniedRows.data, []);
    const deniedMedia = await directAdmin.storage
      .from(mediaBucket)
      .download(mediaAsset.data.object_path, { cacheNonce: randomUUID() }, { cache: "no-store" });
    assert.ok(deniedMedia.error, "Demoted admin still reads private media");
    const deniedMediaViaApp = await mediaGet(
      request(mediaUrl.url, "GET", undefined, adminCookies),
      mediaContext,
    );
    assert.equal(deniedMediaViaApp.status, 404);
    const demotedWorkspace = await workspaceGet(
      request("/api/workspace", "GET", undefined, adminCookies),
    );
    assert.equal(demotedWorkspace.status, 200);
    assert.deepEqual(
      ((await demotedWorkspace.json()) as Workspace).invitations,
      [],
    );
  } catch (error) {
    failure = error;
    console.error(`${target} Supabase smoke failed at: ${step}`);
    console.error(
      "Smoke assertion:",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    // Remove only records owned by this run's synthetic users. This also handles
    // a successful write followed by a failed response before we see its ID.
    step = "clean up synthetic records";
    const cleanupIssues: string[] = [];
    const ownerIds = new Set(identities.map((identity) => identity.id));
    if (attemptedEmails.size) {
      try {
        for (const id of await findSyntheticAuthUserIds()) ownerIds.add(id);
      } catch {
        cleanupIssues.push("find synthetic Auth users");
      }
    }
    const ownedIds = new Set(invitationId ? [invitationId] : []);
    if (ownerIds.size) {
      try {
        const owned = await admin
          .from("invitations")
          .select("id")
          .in("owner_id", [...ownerIds]);
        assert.ifError(owned.error);
        for (const row of owned.data || []) ownedIds.add(row.id);
      } catch {
        cleanupIssues.push("find owned invitations");
      }
    }
    let storageCleanupFailed = false;
    if (ownedIds.size) {
      // Storage objects must be removed through its API before the invitation
      // cascade deletes media_assets; deleting only SQL metadata leaves orphans.
      for (const id of ownedIds) {
        try {
          const bucket = admin.storage.from(mediaBucket);
          const assets = await admin
            .from("media_assets")
            .select("object_path")
            .eq("invitation_id", id);
          assert.ifError(assets.error);
          const knownPaths = (assets.data || []).map((asset) => {
            assert.match(
              asset.object_path,
              new RegExp(`^${id}/[a-f0-9-]+\\.webp$`),
            );
            return asset.object_path;
          });
          if (knownPaths.length) {
            const removedKnown = await bucket.remove(knownPaths);
            assert.ifError(removedKnown.error);
          }
          for (let batch = 0; batch < 10; batch++) {
            const listed = await bucket.list(id, { limit: 100 });
            assert.ifError(listed.error);
            const paths = (listed.data || []).map((entry) => {
              assert.match(entry.name, /^[a-f0-9-]+\.webp$/);
              return `${id}/${entry.name}`;
            });
            if (!paths.length) break;
            const removed = await bucket.remove(paths);
            assert.ifError(removed.error);
            if (batch === 9)
              throw new Error("Synthetic Storage folder still contains media");
          }
          const verified = await bucket.list(id, { limit: 100 });
          assert.ifError(verified.error);
          assert.equal(verified.data?.length, 0);
        } catch {
          storageCleanupFailed = true;
          cleanupIssues.push(`remove Storage objects for ${id}`);
        }
      }
    }
    if (!storageCleanupFailed && ownedIds.size) {
      for (const table of ["entitlements", "payment_events", "orders"] as const) {
        try {
          const deleted = await admin
            .from(table)
            .delete()
            .in("invitation_id", [...ownedIds]);
          assert.ifError(deleted.error);
        } catch {
          cleanupIssues.push(`delete synthetic ${table}`);
        }
      }
      try {
        const deleted = await admin
          .from("audit_logs")
          .delete()
          .in("invitation_id", [...ownedIds]);
        assert.ifError(deleted.error);
      } catch {
        cleanupIssues.push("delete audit entries");
      }
      try {
        const deleted = await admin
          .from("invitations")
          .delete()
          .in("id", [...ownedIds]);
        assert.ifError(deleted.error);
      } catch {
        cleanupIssues.push("delete owned invitations");
      }
    }
    if (!storageCleanupFailed) {
      for (const id of ownerIds) {
        try {
          const deleted = await admin.auth.admin.deleteUser(id);
          assert.ifError(deleted.error);
        } catch {
          cleanupIssues.push(`delete synthetic Auth user ${id}`);
        }
      }
    } else {
      cleanupIssues.push("kept synthetic records for Storage cleanup review");
    }
    if (ownerIds.size) {
      try {
        const remaining = await admin
          .from("invitations")
          .select("id")
          .in("owner_id", [...ownerIds]);
        assert.ifError(remaining.error);
        assert.equal(remaining.data?.length, 0);
      } catch {
        cleanupIssues.push("verify invitations removed");
      }
      try {
        const remaining = await admin
          .from("profiles")
          .select("id")
          .in("id", [...ownerIds]);
        assert.ifError(remaining.error);
        assert.equal(remaining.data?.length, 0);
      } catch {
        cleanupIssues.push("verify profiles removed");
      }
    }
    if (ownedIds.size) {
      for (const table of ["entitlements", "payment_events", "orders"] as const) {
        try {
          const remaining = await admin
            .from(table)
            .select("invitation_id")
            .in("invitation_id", [...ownedIds]);
          assert.ifError(remaining.error);
          assert.equal(remaining.data?.length, 0);
        } catch {
          cleanupIssues.push(`verify synthetic ${table} removed`);
        }
      }
      for (const id of ownedIds) {
        try {
          const listed = await admin.storage.from(mediaBucket).list(id, {
            limit: 100,
          });
          assert.ifError(listed.error);
          assert.equal(listed.data?.length, 0);
        } catch {
          cleanupIssues.push(`verify Storage objects removed for ${id}`);
        }
      }
      try {
        const remaining = await admin
          .from("media_assets")
          .select("id")
          .in("invitation_id", [...ownedIds]);
        assert.ifError(remaining.error);
        assert.equal(remaining.data?.length, 0);
        if (mediaId) {
          const uploaded = await admin
            .from("media_assets")
            .select("id")
            .eq("id", mediaId)
            .maybeSingle();
          assert.ifError(uploaded.error);
          assert.equal(uploaded.data, null);
        }
      } catch {
        cleanupIssues.push("verify media assets removed");
      }
      try {
        const remaining = await admin
          .from("audit_logs")
          .select("id")
          .in("invitation_id", [...ownedIds]);
        assert.ifError(remaining.error);
        assert.equal(remaining.data?.length, 0);
      } catch {
        cleanupIssues.push("verify audit entries removed");
      }
      try {
        const remaining = await admin
          .from("invitation_documents")
          .select("invitation_id")
          .in("invitation_id", [...ownedIds]);
        assert.ifError(remaining.error);
        assert.equal(remaining.data?.length, 0);
      } catch {
        cleanupIssues.push("verify invitation documents removed");
      }
    }
    if (attemptedEmails.size) {
      try {
        assert.equal((await findSyntheticAuthUserIds()).size, 0);
      } catch {
        cleanupIssues.push("verify synthetic Auth users removed");
      }
    }
    if (cleanupIssues.length) {
      console.error(
        `${target} Supabase smoke cleanup failed (${cleanupIssues.join(", ")}).`,
      );
      console.error("Synthetic user IDs for manual cleanup:", [...ownerIds]);
      console.error("Synthetic emails for manual cleanup:", [
        ...attemptedEmails,
      ]);
      failure ||= new Error("Cleanup failed");
    }
  }
  if (failure) {
    process.exitCode = 1;
  } else {
    console.log(
      `${target} Supabase smoke passed: Auth, profile, draft, audit, isolation, private media, preview rotation, paid assistance queue and claim; synthetic data removed.`,
    );
  }
}
