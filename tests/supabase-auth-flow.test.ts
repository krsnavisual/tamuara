import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/auth/route";
import { GET as confirmEmail } from "../src/app/api/auth/callback/route";

const accountId = "11111111-1111-4111-8111-111111111111";
const authUser = {
  id: accountId,
  aud: "authenticated",
  email: "pasangan@example.com",
  email_confirmed_at: "2026-09-25T00:00:00.000Z",
  created_at: "2026-09-25T00:00:00.000Z",
  app_metadata: { provider: "email", providers: ["email"] },
  user_metadata: { name: "Pasangan Tamuara" },
};

test("login trusts the verified profile role and returns a server-side session cookie", async () => {
  const calls: { path: string; body: string }[] = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const path = request.url || "";
    calls.push({ path, body });
    response.setHeader("Content-Type", "application/json");
    if (
      path.startsWith("/auth/v1/token?grant_type=password") ||
      path.startsWith("/auth/v1/token?grant_type=pkce")
    ) {
      response.end(
        JSON.stringify({
          access_token: "test-access-token",
          refresh_token: "test-refresh-token",
          expires_in: 3600,
          token_type: "bearer",
          user: authUser,
        }),
      );
    } else if (path.startsWith("/auth/v1/signup")) {
      response.end(JSON.stringify({ user: authUser, session: null }));
    } else if (path.startsWith("/auth/v1/recover")) {
      response.end(JSON.stringify({}));
    } else if (path === "/auth/v1/user") {
      response.end(JSON.stringify(authUser));
    } else if (path.startsWith("/rest/v1/profiles?")) {
      response.end(
        JSON.stringify({ display_name: "Pasangan Tamuara", role: "owner" }),
      );
    } else {
      response.statusCode = 404;
      response.end(
        JSON.stringify({ message: `Unknown mock endpoint: ${path}` }),
      );
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  const previous = {
    backend: process.env.TAMUARA_BACKEND,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    encryptionKey: process.env.TAMUARA_TOKEN_ENCRYPTION_KEY,
    appUrl: process.env.TAMUARA_APP_URL,
  };
  try {
    process.env.TAMUARA_BACKEND = "supabase";
    process.env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${address.port}`;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-test-key";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-test-key";
    process.env.TAMUARA_TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    process.env.TAMUARA_APP_URL = "http://127.0.0.1:3001";
    const request = new NextRequest("http://127.0.0.1:3001/api/auth", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "http://127.0.0.1:3001",
      },
      body: JSON.stringify({
        action: "login",
        email: authUser.email,
        password: "secret-password",
        role: "admin",
      }),
    });
    const response = await POST(request);
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const data = await response.json();
    assert.equal(data.user.role, "owner");
    assert.equal(data.user.id, accountId);
    assert.equal(data.mode, "supabase");
    assert.match(response.headers.get("set-cookie") || "", /HttpOnly/i);
    assert.match(response.headers.get("cache-control") || "", /no-store/i);
    assert(calls.some(({ path }) => path === "/auth/v1/user"));
    assert(calls.some(({ path }) => path.startsWith("/rest/v1/profiles?")));

    const signup = await POST(
      new NextRequest("http://127.0.0.1:3001/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3001",
        },
        body: JSON.stringify({
          action: "register",
          email: "baru@example.com",
          password: "secret-password",
          name: "Pasangan Baru",
          role: "admin",
        }),
      }),
    );
    assert.equal(signup.status, 200);
    assert.deepEqual(await signup.json(), {
      mode: "supabase",
      requiresEmailConfirmation: true,
    });
    const signupCall = calls.find(({ path }) =>
      path.startsWith("/auth/v1/signup"),
    );
    assert(signupCall);
    const submitted = JSON.parse(signupCall.body);
    assert.deepEqual(submitted.data, { name: "Pasangan Baru" });
    assert(!("role" in submitted));
    assert.match(signupCall.path, /redirect_to=.*api%2Fauth%2Fcallback/);
    const signupCookies = signup.cookies.getAll();
    assert(
      signupCookies.length > 0,
      "PKCE signup should set a verifier cookie",
    );
    const callback = await confirmEmail(
      new NextRequest(
        "http://127.0.0.1:3001/api/auth/callback?code=example-auth-code&next=https%3A%2F%2Fevil.example",
        {
          headers: {
            Cookie: signupCookies
              .map(({ name, value }) => `${name}=${value}`)
              .join("; "),
          },
        },
      ),
    );
    assert.equal(
      callback.status,
      307,
      JSON.stringify(await callback.clone().text()),
    );
    assert.equal(callback.headers.get("location"), "http://127.0.0.1:3001/app");
    assert.match(callback.headers.get("set-cookie") || "", /HttpOnly/i);
    assert(
      calls.some(({ path }) =>
        path.startsWith("/auth/v1/token?grant_type=pkce"),
      ),
    );

    const recover = await POST(
      new NextRequest("http://127.0.0.1:3001/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3001",
        },
        body: JSON.stringify({
          action: "recover",
          email: "unknown@example.com",
        }),
      }),
    );
    assert.equal(recover.status, 200);
    assert.deepEqual(await recover.json(), {
      ok: true,
      mode: "supabase",
      message: "Jika akun terdaftar, email pemulihan akan dikirim.",
    });
    const recoveryCall = calls.find(({ path }) =>
      path.startsWith("/auth/v1/recover"),
    );
    assert(recoveryCall);
    assert.match(recoveryCall.path, /flow%3Drecovery/);
    const recoveryCookies = recover.cookies.getAll();
    assert(recoveryCookies.length > 0);
    const recoveryCallback = await confirmEmail(
      new NextRequest(
        "http://127.0.0.1:3001/api/auth/callback?flow=recovery&code=example-recovery-code",
        {
          headers: {
            Cookie: recoveryCookies
              .map(({ name, value }) => `${name}=${value}`)
              .join("; "),
          },
        },
      ),
    );
    assert.equal(recoveryCallback.status, 307);
    assert.equal(
      recoveryCallback.headers.get("location"),
      "http://127.0.0.1:3001/atur-kata-sandi",
    );

    const withoutSession = await POST(
      new NextRequest("http://127.0.0.1:3001/api/auth", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Origin: "http://127.0.0.1:3001",
        },
        body: JSON.stringify({
          action: "updatePassword",
          password: "replacement-password",
        }),
      }),
    );
    assert.equal(withoutSession.status, 401);
  } finally {
    for (const [name, value] of Object.entries({
      TAMUARA_BACKEND: previous.backend,
      NEXT_PUBLIC_SUPABASE_URL: previous.url,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: previous.anonKey,
      SUPABASE_SERVICE_ROLE_KEY: previous.serviceKey,
      TAMUARA_TOKEN_ENCRYPTION_KEY: previous.encryptionKey,
      TAMUARA_APP_URL: previous.appUrl,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
