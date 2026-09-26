/** Local SQL integration with a synthetic provider. Never calls Midtrans. */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Invitation, User } from "../src/lib/types";
import { createPaymentService } from "../src/lib/server/payments/service";
import { createSupabaseWorkspaceAdapter } from "../src/lib/server/supabase-workspace";
import { AppError } from "../src/lib/server/errors";

function localCredentials() {
  // Capture all CLI output so credentials never reach terminal logs.
  const output = execSync("npx --no-install supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 30_000,
  });
  const status = JSON.parse(output) as Record<string, unknown>;
  assert.equal(typeof status.API_URL, "string");
  const url = new URL(status.API_URL as string);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "54321");
  assert.equal(url.pathname, "/");
  assert.equal(url.username, "");
  assert.equal(url.password, "");
  assert.equal(url.search, "");
  assert.equal(url.hash, "");
  assert.match(String(status.SECRET_KEY), /^sb_secret_/);
  return { url: url.origin, key: status.SECRET_KEY as string };
}

type FakeTransaction = {
  orderId: string;
  amountIdr: number;
  transactionId: string;
  status: string;
  amountOverride?: number;
  fraudStatus?: string;
};
const syntheticKey = "SB-synthetic-local-payment-smoke";

async function main() {
  const credentials = localCredentials(); // Reject a remote host before any mutation.
  process.env.TAMUARA_PAYMENT_MODE = "disabled";
  const admin = createClient(credentials.url, credentials.key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const workspace = createSupabaseWorkspaceAdapter({
    admin,
    key: randomBytes(32).toString("hex"),
  });
  const transactions = new Map<string, FakeTransaction>();
  let createCalls = 0;
  let statusCalls = 0;
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      `Basic ${Buffer.from(`${syntheticKey}:`).toString("base64")}`,
    );
    assert.equal(init?.redirect, "error");
    assert.equal(init?.cache, "no-store");
    if (init?.method === "POST") {
      assert.equal(
        url.href,
        "https://app.sandbox.midtrans.com/snap/v1/transactions",
      );
      const body = JSON.parse(String(init.body)) as {
        transaction_details: { order_id: string; gross_amount: number };
      };
      const orderId = body.transaction_details.order_id;
      assert.ok(!transactions.has(orderId), "Provider creation was repeated");
      createCalls++;
      transactions.set(orderId, {
        orderId,
        amountIdr: body.transaction_details.gross_amount,
        transactionId: randomUUID(),
        status: "pending",
      });
      return Response.json(
        {
          token: randomUUID(),
          redirect_url: `https://app.sandbox.midtrans.com/snap/v3/redirection/${randomUUID()}`,
        },
        { status: 201 },
      );
    }
    assert.equal(init?.method, "GET");
    assert.equal(url.origin, "https://api.sandbox.midtrans.com");
    assert.match(url.pathname, /^\/v2\/[A-Za-z0-9_-]+\/status$/);
    statusCalls++;
    const id = url.pathname.split("/")[2];
    const transaction =
      transactions.get(id) ||
      [...transactions.values()].find((t) => t.transactionId === id);
    if (!transaction) return Response.json({ status_code: "404" });
    return Response.json({
      order_id: transaction.orderId,
      transaction_id: transaction.transactionId,
      gross_amount: `${transaction.amountOverride ?? transaction.amountIdr}.00`,
      transaction_status: transaction.status,
      status_code: "200",
      currency: "IDR",
      payment_type: "credit_card",
      ...(transaction.fraudStatus
        ? { fraud_status: transaction.fraudStatus }
        : {}),
    });
  };
  const payments = createPaymentService({
    admin,
    fetch: fakeFetch,
    env: {
      TAMUARA_PAYMENT_MODE: "sandbox",
      MIDTRANS_IS_PRODUCTION: "false",
      MIDTRANS_SERVER_KEY: syntheticKey,
    },
  });
  const users: User[] = [];
  const emails = new Set<string>();
  const invitationIds = new Set<string>();
  let priorPlans: Record<string, unknown>[] = [];
  let changedPlans = false;
  let failure = false;
  let step = "read local catalog";

  async function invitation(owner: User, label: string) {
    const created = await workspace.mutateWorkspace(owner, {
      action: "create",
      payload: {
        brideName: `Payment ${label}`,
        groomName: "Smoke",
        theme: "classic",
      },
    });
    const draft = created.invitations.find((i) => !invitationIds.has(i.id));
    assert.ok(draft);
    invitationIds.add(draft.id);
    const content = structuredClone(draft.content);
    content.events[0].date = new Date(Date.now() + 180 * 86400_000)
      .toISOString()
      .slice(0, 10);
    const saved = await workspace.mutateWorkspace(owner, {
      action: "save",
      invitationId: draft.id,
      version: draft.version,
      payload: { content, theme: draft.theme, slug: draft.slug },
    });
    return saved.invitations.find((i) => i.id === draft.id)!;
  }
  async function readInvitation(owner: User, id: string) {
    const result = await workspace.getWorkspace(owner);
    const inv = result.invitations.find((i) => i.id === id);
    assert.ok(inv);
    return inv;
  }
  async function order(invitationId: string) {
    const result = await admin
      .from("orders")
      .select("*")
      .eq("invitation_id", invitationId)
      .single();
    assert.ifError(result.error);
    assert.ok(result.data);
    return result.data;
  }
  async function checkout(
    owner: User,
    draft: Invitation,
    idempotencyKey = randomUUID(),
  ) {
    await payments.checkout(owner, {
      action: "checkout",
      invitationId: draft.id,
      version: draft.version,
      payload: { plan: "mandiri", idempotencyKey, amount: 1 },
    });
    return order(draft.id);
  }
  function notification(
    transaction: FakeTransaction,
    status = transaction.status,
  ) {
    const body = {
      order_id: transaction.orderId,
      transaction_id: transaction.transactionId,
      gross_amount: `${transaction.amountIdr}.00`,
      status_code: "200",
      transaction_status: status,
    };
    return {
      ...body,
      signature_key: createHash("sha512")
        .update(
          `${body.order_id}${body.status_code}${body.gross_amount}${syntheticKey}`,
        )
        .digest("hex"),
    };
  }
  async function noEntitlement(id: string) {
    const result = await admin
      .from("entitlements")
      .select("order_id")
      .eq("invitation_id", id);
    assert.ifError(result.error);
    assert.deepEqual(result.data, []);
  }

  try {
    const catalog = await admin.from("plans").select("*").order("id");
    assert.ifError(catalog.error);
    assert.equal(catalog.data?.length, 2);
    priorPlans = catalog.data!;
    changedPlans = true; // Restore even if the activation response is uncertain.
    const activated = await admin
      .from("plans")
      .update({ active: true })
      .in("id", ["mandiri", "assisted"]);
    assert.ifError(activated.error);
    const expectedPrice = Number(
      priorPlans.find((p) => p.id === "mandiri")!.amount_idr,
    );

    step = "create synthetic local owners";
    for (const label of ["a", "b"]) {
      const email = `payment-smoke-${randomUUID()}-${label}@example.test`;
      emails.add(email);
      const created = await admin.auth.admin.createUser({
        email,
        password: `PaymentSmoke!${randomBytes(16).toString("hex")}`,
        email_confirm: true,
        user_metadata: { name: `Payment Smoke ${label}` },
      });
      assert.ifError(created.error);
      assert.ok(created.data.user);
      users.push({
        id: created.data.user.id,
        name: `Payment Smoke ${label}`,
        email,
        role: "owner",
      });
    }

    step = "concurrent checkout reserves and creates provider session once";
    const first = await invitation(users[0], "Refund");
    const idempotencyKey = randomUUID();
    await Promise.all([
      checkout(users[0], first, idempotencyKey),
      checkout(users[0], first, idempotencyKey),
    ]);
    assert.equal(createCalls, 1);
    const firstOrder = await order(first.id);
    assert.equal(
      firstOrder.amount_idr,
      expectedPrice,
      "Browser amount overrode SQL catalog",
    );
    assert.equal(firstOrder.status, "pending");
    const stored = await admin
      .from("payment_checkout_sessions")
      .select("redirect_url")
      .eq("order_id", firstOrder.id)
      .single();
    assert.ifError(stored.error);
    assert.match(
      stored.data!.redirect_url,
      /^https:\/\/app\.sandbox\.midtrans\.com\/snap\/v3\/redirection\//,
    );
    const projected = await payments.decorateWorkspace(
      users[0],
      await workspace.getWorkspace(users[0]),
    );
    assert.equal(
      projected.invitations.find((i) => i.id === first.id)!.orders[0]
        .paymentUrl,
      stored.data!.redirect_url,
    );
    const other = await payments.decorateWorkspace(
      users[1],
      await workspace.getWorkspace(users[1]),
    );
    assert.deepEqual(other.invitations, []);
    await assert.rejects(
      payments.refresh(users[1], firstOrder.id),
      (error: unknown) => error instanceof AppError && error.status === 404,
    );

    step = "pending status has no entitlement";
    await payments.refresh(users[0], firstOrder.id);
    await noEntitlement(first.id);
    const transaction = transactions.get(firstOrder.id)!;
    transaction.status = "settlement";
    step =
      "verified webhook activates SQL and document exactly once without publishing";
    await Promise.all([
      payments.webhook(notification(transaction)),
      payments.webhook(notification(transaction)),
    ]);
    assert.equal((await order(first.id)).status, "paid");
    const entitlement = await admin
      .from("entitlements")
      .select("*")
      .eq("invitation_id", first.id)
      .single();
    assert.ifError(entitlement.error);
    const document = await admin
      .from("invitation_documents")
      .select("state,version")
      .eq("invitation_id", first.id)
      .single();
    assert.ifError(document.error);
    assert.equal(
      document.data!.state.entitlement.orderId,
      entitlement.data!.order_id,
    );
    assert.equal(
      Date.parse(document.data!.state.entitlement.expiresAt),
      Date.parse(entitlement.data!.expires_at),
    );
    assert.equal(document.data!.state.status, "draft");
    assert.equal(document.data!.state.published, undefined);
    const snapshots = await admin
      .from("invitation_publications")
      .select("id")
      .eq("invitation_id", first.id);
    assert.ifError(snapshots.error);
    assert.deepEqual(snapshots.data, []);
    await payments.refresh(users[0], firstOrder.id);
    const duplicate = await admin
      .from("invitation_documents")
      .select("version")
      .eq("invitation_id", first.id)
      .single();
    assert.ifError(duplicate.error);
    assert.equal(duplicate.data!.version, document.data!.version);

    step = "authenticated stale pending cannot regress paid";
    transaction.status = "pending";
    await payments.webhook(notification(transaction));
    assert.equal((await order(first.id)).status, "paid");
    const stillActive = await admin
      .from("entitlements")
      .select("order_id")
      .eq("invitation_id", first.id)
      .single();
    assert.ifError(stillActive.error);
    assert.equal(stillActive.data!.order_id, firstOrder.id);

    step =
      "invalid signature and mismatched provider amount cannot alter payment";
    const callsBeforeInvalid = statusCalls;
    await assert.rejects(
      payments.webhook({
        ...notification(transaction),
        signature_key: "0".repeat(128),
      }),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
    assert.equal(
      statusCalls,
      callsBeforeInvalid,
      "Invalid signature reached provider lookup",
    );
    transaction.amountOverride = transaction.amountIdr + 1;
    await assert.rejects(
      payments.refresh(users[0], firstOrder.id),
      (error: unknown) => error instanceof AppError && error.status === 400,
    );
    delete transaction.amountOverride;
    assert.equal((await order(first.id)).status, "paid");

    step = "refund revokes SQL and document entitlement permanently";
    transaction.status = "refund";
    await payments.webhook(notification(transaction));
    assert.equal((await order(first.id)).status, "refunded");
    await noEntitlement(first.id);
    const refundedDoc = await admin
      .from("invitation_documents")
      .select("state")
      .eq("invitation_id", first.id)
      .single();
    assert.ifError(refundedDoc.error);
    assert.equal(refundedDoc.data!.state.entitlement, undefined);
    transaction.status = "settlement";
    await payments.refresh(users[0], firstOrder.id);
    assert.equal((await order(first.id)).status, "refunded");
    await noEntitlement(first.id);

    step =
      "partial refund review revokes access and cannot restore from delayed success";
    const second = await invitation(users[0], "Review");
    const secondOrder = await checkout(users[0], second);
    const secondTransaction = transactions.get(secondOrder.id)!;
    secondTransaction.status = "settlement";
    await payments.refresh(users[0], secondOrder.id);
    secondTransaction.status = "partial_refund";
    await payments.webhook(notification(secondTransaction));
    assert.equal((await order(second.id)).status, "review");
    await noEntitlement(second.id);
    assert.equal(
      (await readInvitation(users[0], second.id)).expiresAt,
      undefined,
    );
    secondTransaction.status = "settlement";
    await payments.refresh(users[0], secondOrder.id);
    assert.equal((await order(second.id)).status, "review");
    await noEntitlement(second.id);

    step = "negative status fences delayed success after reversal";
    const third = await invitation(users[1], "Reversal");
    const thirdOrder = await checkout(users[1], third);
    const thirdTransaction = transactions.get(thirdOrder.id)!;
    thirdTransaction.status = "deny";
    await payments.refresh(users[1], thirdOrder.id);
    assert.equal((await order(third.id)).status, "failed");
    thirdTransaction.status = "settlement";
    await payments.refresh(users[1], thirdOrder.id);
    assert.notEqual((await order(third.id)).status, "paid");
    await noEntitlement(third.id);
    assert.equal(createCalls, 3);
    console.log(
      "Local payment SQL smoke assertions passed with synthetic provider; merchant integration remains untested.",
    );
  } catch {
    failure = true;
    console.error(`Local payment SQL smoke failed at: ${step}.`);
  } finally {
    const cleanupIssues: string[] = [];
    async function clean(label: string, action: () => Promise<void>) {
      try {
        await action();
      } catch {
        cleanupIssues.push(label);
      }
    }
    // Recover identities if Auth created a fixture but its response was lost.
    await clean("discover synthetic Auth users", async () => {
      for (let page = 1; page <= 100; page++) {
        const listed = await admin.auth.admin.listUsers({ page, perPage: 100 });
        assert.ifError(listed.error);
        for (const u of listed.data.users)
          if (
            u.email &&
            emails.has(u.email) &&
            !users.some((v) => v.id === u.id)
          )
            users.push({
              id: u.id,
              email: u.email,
              name: "Payment Smoke",
              role: "owner",
            });
        if (listed.data.users.length < 100) return;
      }
      throw new Error("Auth scan incomplete");
    });
    if (users.length)
      await clean("discover synthetic invitations", async () => {
        const owned = await admin
          .from("invitations")
          .select("id")
          .in(
            "owner_id",
            users.map((u) => u.id),
          );
        assert.ifError(owned.error);
        for (const row of owned.data || []) invitationIds.add(row.id);
      });
    const ids = [...invitationIds];
    if (ids.length) {
      for (const table of [
        "payment_events",
        "entitlements",
        "payment_checkout_sessions",
        "orders",
        "audit_logs",
      ] as const)
        await clean(`delete ${table}`, async () => {
          const result = await admin
            .from(table)
            .delete()
            .in("invitation_id", ids);
          assert.ifError(result.error);
        });
      await clean("delete invitations", async () => {
        const result = await admin.from("invitations").delete().in("id", ids);
        assert.ifError(result.error);
      });
      for (const table of [
        "payment_events",
        "entitlements",
        "payment_checkout_sessions",
        "orders",
        "audit_logs",
        "invitation_documents",
        "invitation_publications",
        "invitation_members",
      ] as const)
        await clean(`verify ${table} cleanup`, async () => {
          const result = await admin
            .from(table)
            .select("invitation_id")
            .in("invitation_id", ids);
          assert.ifError(result.error);
          assert.deepEqual(result.data, []);
        });
      await clean("verify invitation cleanup", async () => {
        const result = await admin
          .from("invitations")
          .select("id")
          .in("id", ids);
        assert.ifError(result.error);
        assert.deepEqual(result.data, []);
      });
    }
    for (const user of users)
      await clean("delete synthetic Auth user", async () => {
        const result = await admin.auth.admin.deleteUser(user.id);
        assert.ifError(result.error);
      });
    if (users.length)
      await clean("verify profile cleanup", async () => {
        const result = await admin
          .from("profiles")
          .select("id")
          .in(
            "id",
            users.map((u) => u.id),
          );
        assert.ifError(result.error);
        assert.deepEqual(result.data, []);
        for (const user of users) {
          const remaining = await admin.auth.admin.getUserById(user.id);
          assert.ok(remaining.error);
          assert.equal(remaining.data.user, null);
        }
      });
    if (changedPlans)
      await clean("restore full catalog rows", async () => {
        for (const plan of priorPlans) {
          const restored = await admin
            .from("plans")
            .update({
              display_name: plan.display_name,
              amount_idr: plan.amount_idr,
              features: plan.features,
              active: plan.active,
            })
            .eq("id", plan.id);
          assert.ifError(restored.error);
        }
        const current = await admin.from("plans").select("*").order("id");
        assert.ifError(current.error);
        assert.deepEqual(current.data, priorPlans);
      });
    if (cleanupIssues.length) {
      failure = true;
      console.error(
        `Local payment SQL smoke cleanup failed: ${cleanupIssues.join(", ")}.`,
      );
      console.error(
        "Synthetic IDs for cleanup:",
        users.map((u) => u.id),
        ids,
      );
    }
  }
  if (failure) process.exitCode = 1;
  else
    console.log(
      "Local payment SQL smoke passed; synthetic fixtures removed and catalog restored.",
    );
}

main().catch(() => {
  console.error(
    "Local payment SQL smoke could not start; only 127.0.0.1:54321 is allowed.",
  );
  process.exitCode = 1;
});
