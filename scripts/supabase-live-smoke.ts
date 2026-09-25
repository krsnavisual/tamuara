/** Local-only integration smoke; its credential guard must never accept a remote API. */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { runSupabaseSmoke } from "./supabase-smoke-core";

type LocalStatus = {
  API_URL?: unknown;
  PUBLISHABLE_KEY?: unknown;
  SECRET_KEY?: unknown;
};

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

async function main() {
  await runSupabaseSmoke(localCredentials(), "Local");
}

main().catch(() => {
  console.error("Local Supabase smoke could not start.");
  process.exitCode = 1;
});
