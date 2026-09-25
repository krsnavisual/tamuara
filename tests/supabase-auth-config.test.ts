import test from "node:test";
import assert from "node:assert/strict";
import {
  backendMode,
  supabaseApiKeys,
} from "../src/lib/server/backend-config";

const settings = [
  "NODE_ENV",
  "TAMUARA_BACKEND",
  "TAMUARA_LOCAL_PREVIEW",
  "TAMUARA_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "TAMUARA_TOKEN_ENCRYPTION_KEY",
] as const;

function withEnvironment(
  values: Partial<Record<(typeof settings)[number], string>>,
  run: () => void,
) {
  const previous = Object.fromEntries(
    settings.map((key) => [key, process.env[key]]),
  );
  try {
    for (const key of settings) delete process.env[key];
    for (const [key, value] of Object.entries(values)) {
      (process.env as Record<string, string | undefined>)[key] = value;
    }
    run();
  } finally {
    for (const key of settings) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else (process.env as Record<string, string | undefined>)[key] = value;
    }
  }
}

test("local backend is available during development", () => {
  withEnvironment({ NODE_ENV: "development" }, () => {
    assert.equal(backendMode(), "local");
  });
});

test("production never falls back to local storage without explicit preview flag", () => {
  withEnvironment({ NODE_ENV: "production" }, () => {
    assert.throws(() => backendMode(), {
      status: 503,
      code: "BACKEND_NOT_CONFIGURED",
    });
  });
  withEnvironment({ NODE_ENV: "production", TAMUARA_BACKEND: "local" }, () => {
    assert.throws(() => backendMode(), {
      status: 503,
      code: "BACKEND_NOT_CONFIGURED",
    });
  });
  withEnvironment(
    { NODE_ENV: "production", TAMUARA_LOCAL_PREVIEW: "true" },
    () => {
      assert.equal(backendMode(), "local");
    },
  );
});

test("Supabase mode needs all keys and a canonical production URL", () => {
  withEnvironment(
    { NODE_ENV: "development", TAMUARA_BACKEND: "supabase" },
    () => {
      assert.throws(() => backendMode(), {
        status: 503,
        code: "BACKEND_NOT_CONFIGURED",
      });
    },
  );
  withEnvironment(
    {
      NODE_ENV: "production",
      TAMUARA_BACKEND: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TAMUARA_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    },
    () =>
      assert.throws(() => backendMode(), {
        status: 503,
        code: "BACKEND_NOT_CONFIGURED",
      }),
  );
  withEnvironment(
    {
      NODE_ENV: "production",
      TAMUARA_BACKEND: "supabase",
      TAMUARA_APP_URL: "https://tamuara.example",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "service-key",
      TAMUARA_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    },
    () => assert.equal(backendMode(), "supabase"),
  );
});

test("Supabase mode accepts current API keys and prefers them over legacy keys", () => {
  withEnvironment(
    {
      NODE_ENV: "production",
      TAMUARA_BACKEND: "supabase",
      TAMUARA_APP_URL: "https://tamuara.example",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_current",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "legacy-anon",
      SUPABASE_SECRET_KEY: "sb_secret_current",
      SUPABASE_SERVICE_ROLE_KEY: "legacy-service",
      TAMUARA_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    },
    () => {
      assert.equal(backendMode(), "supabase");
      assert.deepEqual(supabaseApiKeys(), {
        publishableKey: "sb_publishable_current",
        secretKey: "sb_secret_current",
      });
    },
  );
});

test("Supabase mode accepts current API keys without legacy values", () => {
  withEnvironment(
    {
      NODE_ENV: "development",
      TAMUARA_BACKEND: "supabase",
      NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_current",
      SUPABASE_SECRET_KEY: "sb_secret_current",
      TAMUARA_TOKEN_ENCRYPTION_KEY: "a".repeat(64),
    },
    () => assert.equal(backendMode(), "supabase"),
  );
});
