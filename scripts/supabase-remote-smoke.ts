/** Explicitly opted-in smoke test for the known, temporary Tamuara Supabase project. */
import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { runSupabaseSmoke } from "./supabase-smoke-core";

const projectRef = "fegugfhyahwdcfydapuf";

function remoteCredentials() {
  // Next's loader reads .env.local without echoing its server-side secrets.
  loadEnvConfig(process.cwd());
  assert.equal(
    process.env.TAMUARA_REMOTE_SMOKE_PROJECT_REF,
    projectRef,
    "Remote smoke requires the exact Tamuara project ref as opt-in",
  );

  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const url = new URL(rawUrl);
  assert.equal(url.protocol, "https:", "Remote smoke requires HTTPS");
  assert.equal(
    url.hostname,
    `${projectRef}.supabase.co`,
    "Remote smoke is restricted to the Tamuara Supabase project",
  );
  assert.equal(url.port, "");
  assert.equal(url.pathname, "/");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");

  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "";
  assert.ok(publishableKey, "Remote publishable key is missing");
  assert.ok(secretKey, "Remote server key is missing");
  assert.notEqual(
    publishableKey,
    secretKey,
    "Remote public and server keys must differ",
  );
  assert.ok(
    !publishableKey.startsWith("sb_secret_"),
    "Server key cannot be used as a public key",
  );
  assert.ok(
    !secretKey.startsWith("sb_publishable_"),
    "Public key cannot be used as a server key",
  );
  return { url: url.origin, publishableKey, secretKey };
}

async function main() {
  await runSupabaseSmoke(remoteCredentials(), "Remote");
}

main().catch(() => {
  console.error(
    "Remote Supabase smoke could not start. Check opt-in, project URL, and environment keys.",
  );
  process.exitCode = 1;
});
