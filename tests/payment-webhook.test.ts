import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/payments/midtrans/webhook/route";
import { readJson, readJsonBody } from "../src/lib/server/http";
import { AppError } from "../src/lib/server/errors";

function notification(body: string, type = "application/json") {
  return new NextRequest(
    "http://127.0.0.1:3001/api/payments/midtrans/webhook",
    {
      method: "POST",
      headers: {
        "content-type": type,
        origin: "https://provider.example",
        "sec-fetch-site": "cross-site",
      },
      body,
    },
  );
}

test("provider JSON parsing accepts external origin while browser mutations still require same origin", async () => {
  assert.deepEqual(
    await readJsonBody(notification('{"order_id":"test"}'), 32 * 1024),
    { order_id: "test" },
  );
  await assert.rejects(
    readJson(notification('{"action":"checkout"}')),
    (e) => e instanceof AppError && e.code === "INVALID_ORIGIN",
  );
});

test("webhook body is bounded and must be a JSON object", async () => {
  await assert.rejects(
    readJsonBody(
      notification(JSON.stringify({ padding: "x".repeat(33000) })),
      32 * 1024,
    ),
    (e) => e instanceof AppError && e.status === 413,
  );
  for (const value of ["[]", "null", "not-json"])
    await assert.rejects(
      readJsonBody(notification(value), 32 * 1024),
      (e) => e instanceof AppError && e.status === 400,
    );
  await assert.rejects(
    readJsonBody(notification("{}", "text/plain"), 32 * 1024),
    (e) => e instanceof AppError && e.status === 415,
  );
});

test("unconfigured webhook fails closed without a merchant call", async () => {
  const previous = {
    backend: process.env.TAMUARA_BACKEND,
    mode: process.env.TAMUARA_PAYMENT_MODE,
  };
  try {
    process.env.TAMUARA_BACKEND = "local";
    process.env.TAMUARA_PAYMENT_MODE = "disabled";
    const response = await POST(notification("{}"));
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).code, "PAYMENT_NOT_CONFIGURED");
  } finally {
    if (previous.backend === undefined) delete process.env.TAMUARA_BACKEND;
    else process.env.TAMUARA_BACKEND = previous.backend;
    if (previous.mode === undefined) delete process.env.TAMUARA_PAYMENT_MODE;
    else process.env.TAMUARA_PAYMENT_MODE = previous.mode;
  }
});
