/**
 * Local-only integration smoke for Supabase Auth and Tamuara route handlers.
 * Run after `npx supabase start` and applying local migrations.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import type { Invitation, User, Workspace } from "../src/lib/types";

type LocalStatus = {
  API_URL?: unknown;
  PUBLISHABLE_KEY?: unknown;
  SECRET_KEY?: unknown;
};
type Cookie = { name: string; value: string };

function localCredentials() {
  // Capture CLI output: API keys must never appear in terminal logs.
  const output = execSync("npx --no-install supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  const status = JSON.parse(output) as LocalStatus;
  assert.equal(typeof status.API_URL, "string", "Local API URL is missing");
  const url = new URL(status.API_URL as string);
  assert.equal(url.protocol, "http:", "Only the local HTTP API is allowed");
  assert.equal(url.hostname, "127.0.0.1", "Only loopback is allowed");
  assert.equal(url.port, "54321", "Unexpected local API port");
  assert.equal(url.pathname, "/", "Unexpected local API path");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.match(String(status.PUBLISHABLE_KEY), /^sb_publishable_/);
  assert.match(String(status.SECRET_KEY), /^sb_secret_/);
  return {
    url: url.origin,
    publishableKey: status.PUBLISHABLE_KEY as string,
    secretKey: status.SECRET_KEY as string,
  };
}

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

async function main() {
  let step = "local credentials";
  const { url, publishableKey, secretKey } = localCredentials();
  process.env.TAMUARA_BACKEND = "supabase";
  process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableKey;
  process.env.SUPABASE_SECRET_KEY = secretKey;
  process.env.TAMUARA_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("hex");
  process.env.TAMUARA_APP_URL = "http://127.0.0.1:3001";

  const admin = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { POST: authPost } = await import("../src/app/api/auth/route");
  const { GET: workspaceGet, POST: workspacePost } =
    await import("../src/app/api/workspace/route");
  const suffix = randomUUID().slice(0, 12);
  const password = `LocalSmoke!${randomBytes(12).toString("hex")}`;
  const identities: Array<{ id: string; email: string; name: string }> = [];
  let invitationId: string | undefined;
  let failure: unknown;

  try {
    step = "create synthetic Auth accounts";
    for (const label of ["A", "B"]) {
      const email = `smoke-${suffix}-${label.toLowerCase()}@example.test`;
      const name = `Smoke Owner ${label}`;
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
    console.log(
      "Local Supabase smoke passed: Auth, profile, draft, audit, isolation.",
    );
  } catch (error) {
    failure = error;
    console.error(`Local Supabase smoke failed at: ${step}`);
  } finally {
    // Remove only records owned by this run's synthetic users. This also handles
    // a successful write followed by a failed response before we see its ID.
    step = "clean up synthetic records";
    try {
      if (identities.length) {
        const owned = await admin
          .from("invitations")
          .select("id")
          .in(
            "owner_id",
            identities.map((identity) => identity.id),
          );
        assert.ifError(owned.error);
        const ownedIds = (owned.data || []).map((row) => row.id);
        if (ownedIds.length) {
          const auditDelete = await admin
            .from("audit_logs")
            .delete()
            .in("invitation_id", ownedIds);
          assert.ifError(auditDelete.error);
          const invitationDelete = await admin
            .from("invitations")
            .delete()
            .in("id", ownedIds);
          assert.ifError(invitationDelete.error);
        }
      }
      for (const identity of identities) {
        const deleted = await admin.auth.admin.deleteUser(identity.id);
        assert.ifError(deleted.error);
      }
    } catch {
      console.error(
        "Local Supabase smoke cleanup failed; inspect synthetic smoke records.",
      );
      failure ||= new Error("Cleanup failed");
    }
  }
  if (failure) process.exitCode = 1;
}

main().catch(() => {
  console.error("Local Supabase smoke could not start.");
  process.exitCode = 1;
});
