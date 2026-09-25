import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { checkOrigin } from "../src/lib/server/http";
test("same-site browser origin uses the real Host even when Next normalizes its internal URL", () => {
  const req = new NextRequest("http://localhost:3001/api/auth", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3001",
      origin: "http://127.0.0.1:3001",
      "sec-fetch-site": "same-origin",
    },
  });
  assert.doesNotThrow(() => checkOrigin(req));
});
test("external origin and cross-site requests remain rejected", () => {
  const req = new NextRequest("http://localhost:3001/api/auth", {
    method: "POST",
    headers: {
      host: "127.0.0.1:3001",
      origin: "https://external.example",
      "sec-fetch-site": "cross-site",
    },
  });
  assert.throws(() => checkOrigin(req), /tidak diizinkan/);
});
