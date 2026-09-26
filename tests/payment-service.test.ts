import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User, Workspace } from "../src/lib/types";
import { AppError } from "../src/lib/server/errors";
import {
  sandboxPaymentConfig,
  sandboxPaymentsEnabled,
} from "../src/lib/server/payments/config";
import {
  createPaymentService,
  safeSandboxRedirect,
} from "../src/lib/server/payments/service";

const owner: User = {
  id: "12000000-0000-4000-8000-000000000001",
  role: "owner",
  name: "Owner",
  email: "owner@example.test",
};
const invitationId = "12000000-0000-4000-8000-000000000002";
const orderId = "12000000-0000-4000-8000-000000000003";
const requestId = "12000000-0000-4000-8000-000000000004";
const env = {
  TAMUARA_PAYMENT_MODE: "sandbox",
  MIDTRANS_SERVER_KEY: "SB-Mid-server-private-test-key",
  MIDTRANS_IS_PRODUCTION: "false",
};
const redirect =
  "https://app.sandbox.midtrans.com/snap/v3/redirection/test-token";
const input = {
  action: "checkout",
  invitationId,
  version: 3,
  payload: { plan: "mandiri", idempotencyKey: requestId, amount: 1 },
};
const base = {
  orderId,
  invitationId,
  ownerId: owner.id,
  planId: "mandiri",
  amountIdr: 249000,
  currency: "IDR",
  status: "created",
  redirectUrl: null,
  transactionId: null,
  expiresAt: "2030-01-01T00:00:00.000Z",
  checkoutState: "uncertain",
};

function fixture(
  responses: Array<{ data: unknown; error: { message: string } | null }> = [],
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const queries: Array<{ table: string; filters: Record<string, unknown> }> =
    [];
  const tables: Record<string, Record<string, unknown>[]> = {
    plans: [
      {
        id: "mandiri",
        display_name: "Paket SQL",
        amount_idr: 321000,
        features: { guestLimit: 600, photoLimit: 25, maxRevisions: 0 },
        active: true,
      },
    ],
    payment_checkout_sessions: [
      {
        order_id: orderId,
        invitation_id: invitationId,
        owner_id: owner.id,
        redirect_url: redirect,
      },
    ],
  };
  const admin = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return responses.shift() ?? { data: base, error: null };
    },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      const query = {
        select() {
          return query;
        },
        eq(k: string, v: unknown) {
          filters[k] = v;
          return query;
        },
        in(k: string, v: unknown[]) {
          filters[k] = v;
          return query;
        },
        then(resolve: (r: { data: unknown[]; error: null }) => unknown) {
          return Promise.resolve(
            resolve({
              data: tables[table].filter((r) =>
                Object.entries(filters).every(([k, v]) =>
                  Array.isArray(v) ? v.includes(r[k]) : r[k] === v,
                ),
              ),
              error: null,
            }),
          );
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { admin, calls, queries, tables };
}
const ok = (data: unknown) => ({ data, error: null });
const fetchReturning = (value: unknown) =>
  (async () => Response.json(value)) as typeof fetch;

test("checkout activation requires explicit sandbox config and sandbox keys; production cannot activate routes", async () => {
  for (const config of [
    {},
    { MIDTRANS_SERVER_KEY: env.MIDTRANS_SERVER_KEY },
    { ...env, TAMUARA_PAYMENT_MODE: "production" },
    { ...env, MIDTRANS_IS_PRODUCTION: "true" },
    { ...env, MIDTRANS_SERVER_KEY: "Mid-server-live-key" },
  ]) {
    assert.equal(sandboxPaymentsEnabled(config), false);
    assert.throws(
      () => sandboxPaymentConfig(config),
      (e) => e instanceof AppError && e.status === 503,
    );
    const db = fixture();
    await assert.rejects(
      createPaymentService({ admin: db.admin, env: config }).checkout(
        owner,
        input,
      ),
      (e) => e instanceof AppError && e.code === "PAYMENT_NOT_CONFIGURED",
    );
    assert.equal(db.calls.length, 0);
  }
  assert.equal(sandboxPaymentsEnabled(env), true);
});

test("checkout reserves once before provider I/O, uses SQL price, and persists hosted redirect without Snap token", async () => {
  const db = fixture([
    ok({ ...base, createClaimed: true }),
    ok({ ...base, redirectUrl: redirect, checkoutState: "ready" }),
    ok({ ...base, createClaimed: false }),
  ]);
  let creates = 0;
  const requestFetch: typeof fetch = async (_url, init) => {
    creates++;
    assert.equal(db.calls[0].name, "reserve_payment_checkout");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.transaction_details.gross_amount, 249000);
    assert.equal(body.transaction_details.order_id, orderId);
    return Response.json({ token: "snap-test-token", redirect_url: redirect });
  };
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: requestFetch,
  });
  await service.checkout(owner, input);
  await service.checkout(owner, input);
  assert.equal(creates, 1);
  assert.deepEqual(
    db.calls.map((c) => c.name),
    [
      "reserve_payment_checkout",
      "save_payment_checkout_redirect",
      "reserve_payment_checkout",
    ],
  );
  assert.deepEqual(db.calls[1].args, {
    p_order_id: orderId,
    p_redirect_url: redirect,
  });
  assert.equal("amount" in db.calls[0].args, false);
  assert.equal(JSON.stringify(db.calls).includes("snap-test-token"), false);
});

test("ambiguous creation failure never releases the persisted claim or retries POST", async () => {
  const db = fixture([
    ok({ ...base, createClaimed: true }),
    ok({ ...base, createClaimed: false }),
  ]);
  let creates = 0;
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: (async () => {
      creates++;
      throw new Error("transport private payload");
    }) as typeof fetch,
  });
  await assert.rejects(
    service.checkout(owner, input),
    (e) =>
      e instanceof AppError &&
      e.status === 503 &&
      !e.message.includes("private"),
  );
  await service.checkout(owner, input);
  assert.equal(creates, 1);
  assert.deepEqual(
    db.calls.map((c) => c.name),
    ["reserve_payment_checkout", "reserve_payment_checkout"],
  );
});

test("payment access and malformed checkout data are denied before persistence or provider requests", async () => {
  const db = fixture();
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: (async () => {
      assert.fail("provider cannot be called");
    }) as typeof fetch,
  });
  await assert.rejects(
    service.checkout({ ...owner, role: "admin" }, input),
    (e) => e instanceof AppError && e.status === 403,
  );
  await assert.rejects(
    service.refresh({ ...owner, role: "admin" }, orderId),
    (e) => e instanceof AppError && e.status === 403,
  );
  await assert.rejects(
    service.checkout(owner, {
      ...input,
      payload: { plan: "mandiri", idempotencyKey: "invalid" },
    }),
    (e) => e instanceof AppError && e.status === 400,
  );
  assert.equal(db.calls.length, 0);
});

test("reconciliation GET404 does not activate, fail, or recreate a checkout", async () => {
  const db = fixture();
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: fetchReturning({ status_code: "404" }),
  });
  await service.refresh(owner, orderId);
  assert.deepEqual(db.calls, [
    {
      name: "get_payment_checkout",
      args: { p_owner_id: owner.id, p_order_id: orderId },
    },
  ]);
});

test("webhook authenticates current status and binds transaction and amount before atomic application", async () => {
  const db = fixture([
    ok({ ...base, transactionId: "stored-transaction" }),
    ok({ ...base, status: "paid" }),
  ]);
  const gross = "249000.00";
  const body = {
    order_id: orderId,
    gross_amount: gross,
    status_code: "200",
    transaction_status: "pending",
    transaction_id: "untrusted-hint",
    signature_key: createHash("sha512")
      .update(`${orderId}200${gross}${env.MIDTRANS_SERVER_KEY}`)
      .digest("hex"),
  };
  let urlSeen = "";
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: (async (url) => {
      urlSeen = String(url);
      return Response.json({
        order_id: orderId,
        gross_amount: gross,
        status_code: "200",
        transaction_status: "settlement",
        transaction_id: "stored-transaction",
      });
    }) as typeof fetch,
  });
  await service.webhook(body);
  assert.match(urlSeen, /stored-transaction\/status$/);
  assert.deepEqual(db.calls[1], {
    name: "apply_verified_payment_status",
    args: {
      p_order_id: orderId,
      p_transaction_id: "stored-transaction",
      p_amount_idr: 249000,
      p_provider_status: "settlement",
      p_payment_state: "paid",
    },
  });
  assert.equal(JSON.stringify(db.calls).includes(body.signature_key), false);
});

test("bad signature and authenticated amount mismatch cannot write a payment event", async () => {
  const db = fixture();
  let fetched = 0;
  const service = createPaymentService({
    admin: db.admin,
    env,
    fetch: (async () => {
      fetched++;
      return Response.json({
        order_id: orderId,
        gross_amount: "1.00",
        status_code: "200",
        transaction_status: "settlement",
        transaction_id: "tx",
      });
    }) as typeof fetch,
  });
  const body = {
    order_id: orderId,
    gross_amount: "249000.00",
    status_code: "200",
    signature_key: "0".repeat(128),
  };
  await assert.rejects(
    service.webhook(body),
    (e) => e instanceof AppError && e.status === 400,
  );
  assert.equal(fetched, 0);
  body.signature_key = createHash("sha512")
    .update(`${orderId}200249000.00${env.MIDTRANS_SERVER_KEY}`)
    .digest("hex");
  await assert.rejects(
    service.webhook(body),
    (e) => e instanceof AppError && e.status === 400,
  );
  assert.equal(
    db.calls.some((c) => c.name === "apply_verified_payment_status"),
    false,
  );
});

test("workspace projects active SQL prices and gives checkout capability only to owner", async () => {
  const db = fixture();
  const ws = {
    user: owner,
    mode: "supabase",
    invitations: [
      {
        id: invitationId,
        ownerId: owner.id,
        orders: [
          {
            id: orderId,
            status: "pending",
            paymentUrl: "https://evil.example",
          },
          { id: requestId, status: "paid" },
        ],
      },
    ],
  } as unknown as Workspace;
  const service = createPaymentService({ admin: db.admin, env });
  const output = await service.decorateWorkspace(owner, ws);
  assert.equal(output.payments?.plans[0].price, 321000);
  assert.equal(output.invitations[0].orders[0].paymentUrl, redirect);
  assert.equal(output.invitations[0].orders[1].paymentUrl, undefined);
  assert.equal(db.queries[1].filters.owner_id, owner.id);
  assert.deepEqual(db.queries[1].filters.invitation_id, [invitationId]);
  assert.equal(
    db.calls.length,
    0,
    "legacy order without session never calls get RPC",
  );
  const adminOutput = await service.decorateWorkspace(
    { ...owner, role: "admin" },
    ws,
  );
  assert.deepEqual(adminOutput.invitations[0].orders, []);
  const disabled = await createPaymentService({
    admin: db.admin,
    env: {},
  }).decorateWorkspace(owner, ws);
  assert.equal(disabled.payments?.enabled, false);
  assert.equal(disabled.invitations[0].orders[0].paymentUrl, undefined);
  assert.equal(
    ws.invitations[0].orders[0].paymentUrl,
    "https://evil.example",
    "original workspace is unchanged",
  );
});

test("browser checkout URLs never include live or external provider hosts", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://app.midtrans.com/snap/v3/redirection/a",
    "https://evil.example/snap/a",
    "https://user@app.sandbox.midtrans.com/snap/a",
    redirect + "#unsafe",
    undefined,
  ])
    assert.equal(safeSandboxRedirect(value), undefined);
  assert.equal(safeSandboxRedirect(redirect), redirect);
});

test("SQL checkout denials return actionable HTTP errors without a provider request", async () => {
  for (const [message, status] of [
    ["PAYMENT_ORDER_NOT_FOUND", 404],
    ["INVITATION_VERSION_CONFLICT", 409],
    ["PAYMENT_CHECKOUT_OPEN", 409],
    ["PAYMENT_PURCHASE_UNAVAILABLE", 409],
    ["PAYMENT_PLAN_UNAVAILABLE", 503],
    ["INVALID_PAYMENT_EVENT_DATES", 400],
  ] as const) {
    const db = fixture([{ data: null, error: { message } }]);
    const service = createPaymentService({
      admin: db.admin,
      env,
      fetch: (async () =>
        assert.fail("denied checkout cannot reach provider")) as typeof fetch,
    });
    await assert.rejects(
      service.checkout(owner, input),
      (e) => e instanceof AppError && e.status === status,
    );
  }
});
