import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import { POST as login } from "../src/app/api/auth/route";
import {
  GET as listAssistance,
  POST as claimAssistance,
} from "../src/app/api/admin/assistance/route";

const invitationId = "21000000-0000-4000-8000-000000000001";
const adminId = "11000000-0000-4000-8000-000000000001";
const origin = "http://127.0.0.1:3001";
const authUser = {
  id: adminId,
  aud: "authenticated",
  email: "admin@example.com",
  email_confirmed_at: "2026-09-25T00:00:00.000Z",
  created_at: "2026-09-25T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Admin Tamuara" },
};

test("admin assistance API uses the verified role and user JWT for queue and atomic claim", async () => {
  let role: "owner" | "admin" = "admin";
  let claimError: "" | "INVITATION_VERSION_CONFLICT" | "ASSISTANCE_UNAVAILABLE" = "";
  const rpcCalls: { path: string; body: string; authorization: string; apikey: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const path = request.url || "";
    response.setHeader("Content-Type", "application/json");
    if (path.startsWith("/auth/v1/token?grant_type=password")) {
      response.end(
        JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: authUser,
        }),
      );
    } else if (path === "/auth/v1/user") {
      response.end(JSON.stringify(authUser));
    } else if (path.startsWith("/rest/v1/profiles?")) {
      response.end(JSON.stringify({ display_name: "Admin Tamuara", role }));
    } else if (path.startsWith("/rest/v1/rpc/")) {
      rpcCalls.push({
        path,
        body,
        authorization: request.headers.authorization || "",
        apikey: String(request.headers.apikey || ""),
      });
      if (path === "/rest/v1/rpc/list_assistance_queue") {
        response.end(
          JSON.stringify([
            {
              invitation_id: invitationId,
              document_version: 2,
              updated_at: "2026-09-25T12:00:00Z",
            },
          ]),
        );
      } else if (path === "/rest/v1/rpc/claim_assistance") {
        if (claimError) {
          response.statusCode = 400;
          response.end(
            JSON.stringify({
              code: "P0001",
              message: claimError,
              details: null,
              hint: null,
            }),
          );
        } else {
          response.end("3");
        }
      } else {
        response.statusCode = 404;
        response.end(JSON.stringify({ message: "Unknown RPC" }));
      }
    } else {
      response.statusCode = 404;
      response.end(JSON.stringify({ message: `Unknown mock endpoint: ${path}` }));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const envKeys = [
    "TAMUARA_BACKEND",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "TAMUARA_TOKEN_ENCRYPTION_KEY",
    "TAMUARA_APP_URL",
  ] as const;
  const previous = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  );
  try {
    process.env.TAMUARA_BACKEND = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "anon-test-key";
    process.env.SUPABASE_SECRET_KEY = "service-test-key";
    process.env.TAMUARA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TAMUARA_APP_URL = origin;

    const unauthenticated = await listAssistance(
      new NextRequest(`${origin}/api/admin/assistance`),
    );
    assert.equal(unauthenticated.status, 401);
    assert.equal(rpcCalls.length, 0);

    const signedIn = await login(
      new NextRequest(`${origin}/api/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: origin },
        body: JSON.stringify({
          action: "login",
          email: authUser.email,
          password: "test-password",
        }),
      }),
    );
    assert.equal(signedIn.status, 200);
    const cookie = signedIn.cookies
      .getAll()
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");
    assert(cookie);
    const get = () =>
      listAssistance(
        new NextRequest(`${origin}/api/admin/assistance`, {
          headers: { Cookie: cookie },
        }),
      );
    const post = (body: unknown, extraHeaders?: Record<string, string>) =>
      claimAssistance(
        new NextRequest(`${origin}/api/admin/assistance`, {
          method: "POST",
          headers: {
            Cookie: cookie,
            "Content-Type": "application/json",
            Origin: origin,
            ...extraHeaders,
          },
          body: JSON.stringify(body),
        }),
      );

    role = "owner";
    assert.equal((await get()).status, 403);
    assert.equal((await post({ invitationId, expectedVersion: 2 })).status, 403);
    assert.equal(rpcCalls.length, 0);

    role = "admin";
    const queue = await get();
    assert.equal(queue.status, 200);
    assert.deepEqual(await queue.json(), {
      requests: [
        {
          invitationId,
          documentVersion: 2,
          updatedAt: "2026-09-25T12:00:00Z",
        },
      ],
    });
    assert.match(queue.headers.get("cache-control") || "", /no-store/);

    const invalid = await post({ invitationId: "bad", expectedVersion: 2 });
    assert.equal(invalid.status, 400);
    assert.equal(rpcCalls.length, 1);
    const crossSite = await post(
      { invitationId, expectedVersion: 2 },
      { Origin: "https://other.example" },
    );
    assert.equal(crossSite.status, 403);
    assert.equal(rpcCalls.length, 1);

    const claimed = await post({ invitationId, expectedVersion: 2 });
    assert.equal(claimed.status, 200);
    assert.deepEqual(await claimed.json(), { ok: true });
    assert.deepEqual(JSON.parse(rpcCalls.at(-1)!.body), {
      p_invitation_id: invitationId,
      p_expected_version: 2,
    });
    assert.equal(rpcCalls.at(-1)!.authorization, "Bearer test-access-token");
    assert.equal(rpcCalls.at(-1)!.apikey, "anon-test-key");

    claimError = "INVITATION_VERSION_CONFLICT";
    const conflict = await post({ invitationId, expectedVersion: 2 });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).code, "INVITATION_VERSION_CONFLICT");

    claimError = "ASSISTANCE_UNAVAILABLE";
    const unavailable = await post({ invitationId, expectedVersion: 2 });
    assert.equal(unavailable.status, 404);
    assert.equal((await unavailable.json()).code, "ASSISTANCE_UNAVAILABLE");

    process.env.TAMUARA_BACKEND = "local";
    const localQueue = await get();
    assert.equal(localQueue.status, 503);
    assert.equal((await localQueue.json()).code, "ADMIN_QUEUE_UNAVAILABLE");
    assert.equal((await post({ invitationId, expectedVersion: 2 })).status, 503);
  } finally {
    for (const key of envKeys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
