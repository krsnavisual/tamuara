import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import {
  createMidtransAdapter,
  MidtransError,
  parseMidtransIdr,
  readMidtransConfig,
} from "../src/lib/server/payments/midtrans";

const serverKey = "SB-Mid-server-synthetic-unit-test";
const order = Object.freeze({
  orderId: "tamuara-order_01",
  amountIdr: 249000,
  currency: "IDR" as const,
});
const config = readMidtransConfig({ MIDTRANS_SERVER_KEY: serverKey });
const status = {
  order_id: order.orderId,
  gross_amount: "249000.00",
  currency: "IDR",
  status_code: "200",
  transaction_id: "synthetic-transaction",
  transaction_status: "settlement",
};
function code(expected: string) {
  return (error: unknown) =>
    error instanceof MidtransError && error.code === expected;
}
function json(value: unknown, httpStatus = 200) {
  return new Response(JSON.stringify(value), { status: httpStatus });
}
function notification(overrides: Record<string, unknown> = {}) {
  const body = { ...status, ...overrides };
  return {
    ...body,
    signature_key: createHash("sha512")
      .update(
        `${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`,
      )
      .digest("hex"),
  };
}

test("Midtrans config defaults to sandbox and requires explicit valid production", () => {
  assert.equal(config.environment, "sandbox");
  assert.equal(
    readMidtransConfig({
      MIDTRANS_SERVER_KEY: "Mid-server-synthetic",
      MIDTRANS_IS_PRODUCTION: "true",
    }).environment,
    "production",
  );
  for (const env of [
    {},
    { MIDTRANS_SERVER_KEY: "secret:invalid" },
    { MIDTRANS_SERVER_KEY: "secret\ninvalid" },
    { MIDTRANS_SERVER_KEY: serverKey, MIDTRANS_IS_PRODUCTION: "TRUE" },
    { MIDTRANS_SERVER_KEY: serverKey, MIDTRANS_IS_PRODUCTION: "true" },
  ]) {
    assert.throws(
      () => readMidtransConfig(env),
      code("PAYMENT_NOT_CONFIGURED"),
    );
  }
});

test("IDR parser accepts only exact positive safe whole rupiah", () => {
  assert.equal(parseMidtransIdr("249000.00"), 249000);
  assert.equal(parseMidtransIdr("249000"), 249000);
  assert.equal(
    parseMidtransIdr("9007199254740991.00"),
    Number.MAX_SAFE_INTEGER,
  );
  for (const value of [
    249000,
    "0",
    "-1",
    "1.01",
    "1.001",
    "1e6",
    "1,000",
    " 1000",
    "9007199254740992",
    "Infinity",
    null,
  ]) {
    assert.throws(
      () => parseMidtransIdr(value),
      code("PROVIDER_INVALID_RESPONSE"),
    );
  }
});

test("Snap uses immutable server amount, sandbox endpoint, Basic auth, and disables redirects", async () => {
  const mutableOrder: { orderId: string; amountIdr: number; currency: "IDR" } =
    { ...order };
  const adapter = createMidtransAdapter(config, {
    fetch: async (url, init) => {
      assert.equal(
        url,
        "https://app.sandbox.midtrans.com/snap/v1/transactions",
      );
      assert.equal(init?.method, "POST");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.cache, "no-store");
      const headers = new Headers(init?.headers);
      assert.equal(
        headers.get("Authorization"),
        `Basic ${Buffer.from(`${serverKey}:`).toString("base64")}`,
      );
      mutableOrder.amountIdr = 1;
      assert.deepEqual(JSON.parse(String(init?.body)), {
        transaction_details: { order_id: order.orderId, gross_amount: 249000 },
        credit_card: { secure: true },
      });
      return json(
        {
          token: "synthetic-token",
          redirect_url:
            "https://app.sandbox.midtrans.com/snap/v4/redirection/synthetic-token",
        },
        201,
      );
    },
  });
  assert.deepEqual(await adapter.createTransaction(mutableOrder), {
    token: "synthetic-token",
    redirectUrl:
      "https://app.sandbox.midtrans.com/snap/v4/redirection/synthetic-token",
  });
  for (const amountIdr of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      adapter.createTransaction({ ...order, amountIdr }),
      code("INVALID_ORDER"),
    );
  }
  await assert.rejects(
    adapter.createTransaction({ ...order, orderId: "../../status" }),
    code("INVALID_ORDER"),
  );
});

test("Snap rejects untrusted redirect hosts and malformed token responses", async () => {
  for (const body of [
    { token: "token", redirect_url: "https://evil.example/snap/pay" },
    { token: "token", redirect_url: "https://app.midtrans.com/snap/pay" },
    {
      token: "token",
      redirect_url: "https://user:secret@app.sandbox.midtrans.com/snap/pay",
    },
    { token: "token", redirect_url: "https://app.sandbox.midtrans.com/other" },
    { token: null, redirect_url: "https://app.sandbox.midtrans.com/snap/pay" },
  ]) {
    const adapter = createMidtransAdapter(config, {
      fetch: async () => json(body),
    });
    await assert.rejects(
      adapter.createTransaction(order),
      code("PROVIDER_INVALID_RESPONSE"),
    );
  }
});

test("server status query binds payment to stored order, amount and IDR", async () => {
  const adapter = createMidtransAdapter(config, {
    fetch: async (url, init) => {
      assert.equal(
        url,
        `https://api.sandbox.midtrans.com/v2/${order.orderId}/status`,
      );
      assert.equal(init?.method, "GET");
      return json(status);
    },
  });
  assert.equal((await adapter.getStatus(order)).paymentState, "paid");
  for (const overrides of [
    { order_id: "another-order" },
    { gross_amount: "248999.00" },
    { currency: "USD" },
  ]) {
    const wrong = createMidtransAdapter(config, {
      fetch: async () => json({ ...status, ...overrides }),
    });
    await assert.rejects(wrong.getStatus(order), code("ORDER_MISMATCH"));
  }
});

test("only confirmed successful states can be paid; refunds, challenges and unknown states require review", async () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [
      {
        transaction_status: "capture",
        payment_type: "credit_card",
        fraud_status: "accept",
      },
      "paid",
    ],
    [
      {
        transaction_status: "capture",
        payment_type: "qris",
        fraud_status: "accept",
      },
      "review",
    ],
    [{ transaction_status: "capture", payment_type: "credit_card" }, "review"],
    [{ fraud_status: "challenge" }, "review"],
    [{ fraud_status: "deny" }, "review"],
    [{ fraud_status: null }, "review"],
    [{ status_code: "201" }, "review"],
    [{ transaction_status: "PENDING" }, "pending"],
    [{ transaction_status: "authorize" }, "pending"],
    [{ transaction_status: "deny" }, "failed"],
    [{ transaction_status: "failure" }, "failed"],
    [{ transaction_status: "cancel" }, "cancelled"],
    [{ transaction_status: "expire" }, "expired"],
    [{ transaction_status: "refund" }, "refunded"],
    [{ transaction_status: "partial_refund" }, "review"],
    [{ transaction_status: "chargeback" }, "review"],
    [{ transaction_status: "partial_chargeback" }, "review"],
    [{ transaction_status: "new_unknown_state" }, "review"],
  ];
  for (const [overrides, expected] of cases) {
    const adapter = createMidtransAdapter(config, {
      fetch: async () => json({ ...status, ...overrides }),
    });
    assert.equal((await adapter.getStatus(order)).paymentState, expected);
  }
});

test("notification uses raw amount signature and current authenticated server status", async () => {
  let queries = 0;
  const adapter = createMidtransAdapter(config, {
    fetch: async () => {
      queries += 1;
      return json({
        ...status,
        transaction_status: "pending",
        status_code: "201",
      });
    },
  });
  // transaction_status is absent from the signature, so a tampered settlement
  // must never be enough to conclude payment succeeded.
  assert.equal(
    (await adapter.verifyNotification(notification(), order)).paymentState,
    "pending",
  );
  assert.equal(queries, 1);
  assert.equal(
    (
      await adapter.verifyNotification(
        notification({ gross_amount: "249000" }),
        order,
      )
    ).paymentState,
    "pending",
  );
  const signed = notification();
  for (const signature_key of ["0".repeat(128), "a", "g".repeat(128), null]) {
    await assert.rejects(
      adapter.verifyNotification({ ...signed, signature_key }, order),
      code("INVALID_SIGNATURE"),
    );
  }
  assert.equal(queries, 2);
  await assert.rejects(
    adapter.verifyNotification(
      notification({ order_id: "other-order" }),
      order,
    ),
    code("INVALID_NOTIFICATION"),
  );
  await assert.rejects(
    adapter.verifyNotification(notification({ gross_amount: "1.00" }), order),
    code("INVALID_NOTIFICATION"),
  );
  assert.equal(queries, 2);
});

test("transaction ID lookup supports DANA and binds authenticated results to transaction, order and amount", async () => {
  const transactionId = "synthetic-dana-transaction";
  const adapter = createMidtransAdapter(config, {
    fetch: async (url) => {
      assert.equal(
        url,
        `https://api.sandbox.midtrans.com/v2/${transactionId}/status`,
      );
      return json({
        ...status,
        payment_type: "dana",
        transaction_id: transactionId,
      });
    },
  });
  assert.equal(
    (await adapter.getStatus(order, transactionId)).paymentState,
    "paid",
  );
  assert.equal(
    (
      await adapter.verifyNotification(
        notification({ transaction_id: transactionId }),
        order,
      )
    ).paymentState,
    "paid",
  );
  // A persisted ID takes precedence over the unsigned notification hint.
  assert.equal(
    (
      await adapter.verifyNotification(
        notification({ transaction_id: "unsigned-other-hint" }),
        order,
        transactionId,
      )
    ).paymentState,
    "paid",
  );
  for (const overrides of [
    { transaction_id: "different-transaction" },
    { order_id: "different-order" },
    { gross_amount: "248999.00" },
  ]) {
    const wrong = createMidtransAdapter(config, {
      fetch: async () =>
        json({ ...status, transaction_id: transactionId, ...overrides }),
    });
    await assert.rejects(
      wrong.getStatus(order, transactionId),
      code("ORDER_MISMATCH"),
    );
    await assert.rejects(
      wrong.verifyNotification(
        notification({ transaction_id: transactionId }),
        order,
      ),
      code("ORDER_MISMATCH"),
    );
  }
});

test("malformed and unknown provider transaction IDs fail with safe typed errors", async () => {
  let calls = 0;
  const adapter = createMidtransAdapter(config, {
    fetch: async () => {
      calls += 1;
      return json({ status_code: "404" });
    },
  });
  for (const transactionId of [
    "",
    "../another",
    "contains space",
    "x".repeat(101),
  ]) {
    await assert.rejects(
      adapter.getStatus(order, transactionId),
      code("INVALID_TRANSACTION_ID"),
    );
    await assert.rejects(
      adapter.verifyNotification(
        notification({ transaction_id: transactionId }),
        order,
      ),
      code("INVALID_NOTIFICATION"),
    );
  }
  assert.equal(calls, 0);
  await assert.rejects(
    adapter.getStatus(order, "unknown-transaction"),
    code("PAYMENT_NOT_FOUND"),
  );
  assert.equal(calls, 1);
});

test("production selects only official live endpoints when explicitly configured", async () => {
  const live = readMidtransConfig({
    MIDTRANS_SERVER_KEY: "Mid-server-synthetic",
    MIDTRANS_IS_PRODUCTION: "true",
  });
  const adapter = createMidtransAdapter(live, {
    fetch: async (url) => {
      assert.equal(url, `https://api.midtrans.com/v2/${order.orderId}/status`);
      return json(status);
    },
  });
  await adapter.getStatus(order);
});

test("provider failures are typed and redact provider payloads and transport secrets", async () => {
  for (const [httpStatus, expected] of [
    [401, "PROVIDER_REJECTED"],
    [500, "PROVIDER_UNAVAILABLE"],
    [404, "PAYMENT_NOT_FOUND"],
  ] as const) {
    const adapter = createMidtransAdapter(config, {
      fetch: async () => json({ secret: serverKey }, httpStatus),
    });
    await assert.rejects(adapter.getStatus(order), code(expected));
  }
  const malformed = createMidtransAdapter(config, {
    fetch: async () => new Response("not json"),
  });
  await assert.rejects(
    malformed.getStatus(order),
    code("PROVIDER_INVALID_RESPONSE"),
  );
  const oversized = createMidtransAdapter(config, {
    fetch: async () => json({ secret: "x".repeat(65 * 1024) }),
  });
  await assert.rejects(
    oversized.getStatus(order),
    code("PROVIDER_INVALID_RESPONSE"),
  );
  const missing = createMidtransAdapter(config, {
    fetch: async () => json({ status_code: "404" }),
  });
  await assert.rejects(missing.getStatus(order), code("PAYMENT_NOT_FOUND"));
  const failed = createMidtransAdapter(config, {
    fetch: async () => {
      throw new Error(serverKey);
    },
  });
  await assert.rejects(failed.getStatus(order), (error: unknown) => {
    assert.ok(error instanceof MidtransError);
    assert.equal(error.code, "PROVIDER_UNAVAILABLE");
    assert.ok(!String(error).includes(serverKey));
    assert.equal(error.cause, undefined);
    return true;
  });
});

test("provider requests time out and abort without retrying transaction creation", async () => {
  let calls = 0;
  const adapter = createMidtransAdapter(config, {
    timeoutMs: 10,
    fetch: async (_url, init) => {
      calls += 1;
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(new Error("aborted")),
          { once: true },
        );
      });
    },
  });
  await assert.rejects(
    adapter.createTransaction(order),
    code("PROVIDER_TIMEOUT"),
  );
  assert.equal(calls, 1);
});
