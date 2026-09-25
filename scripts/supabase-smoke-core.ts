/** Integration smoke shared by the separately guarded local and remote runners. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Invitation, User, Workspace } from "../src/lib/types";

export type SmokeCredentials = {
  url: string;
  publishableKey: string;
  secretKey: string;
};
type Cookie = { name: string; value: string };

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
  const suffix = randomUUID().slice(0, 12);
  const password = `TamuaraSmoke!${randomBytes(12).toString("hex")}`;
  const identities: Array<{ id: string; email: string; name: string }> = [];
  const attemptedEmails = new Set<string>();
  let invitationId: string | undefined;
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
    for (const label of ["A", "B"]) {
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
  } catch (error) {
    failure = error;
    console.error(`${target} Supabase smoke failed at: ${step}`);
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
    if (ownedIds.size) {
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
    for (const id of ownerIds) {
      try {
        const deleted = await admin.auth.admin.deleteUser(id);
        assert.ifError(deleted.error);
      } catch {
        cleanupIssues.push(`delete synthetic Auth user ${id}`);
      }
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
      `${target} Supabase smoke passed: Auth, profile, draft, audit, isolation; synthetic data removed.`,
    );
  }
}
