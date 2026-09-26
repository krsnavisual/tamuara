import { test, expect } from "@playwright/test";
import type { Mutation, Order, Workspace } from "../../src/lib/types";
import { money } from "../../src/lib/catalog";

function paymentWorkspace(orders: Order[] = []): Workspace {
  return {
    user: {
      id: "owner-payment-ui",
      name: "Nadia & Rafi",
      email: "payment-ui@example.test",
      role: "owner",
    },
    mode: "supabase",
    payments: {
      enabled: true,
      environment: "sandbox",
      plans: [
        {
          id: "mandiri",
          name: "Cerita Mandiri",
          price: 173000,
          features: ["Fitur paket dari server"],
        },
        {
          id: "assisted",
          name: "Dirangkai Bersama",
          price: 421000,
          features: ["Bantuan admin dari server"],
        },
      ],
    },
    invitations: [
      {
        id: "invitation-payment-ui",
        ownerId: "owner-payment-ui",
        slug: "payment-ui-fixture",
        status: "draft",
        theme: "classic",
        version: 1,
        content: {
          bride: { name: "Nadia", fullName: "Nadia", parents: "" },
          groom: { name: "Rafi", fullName: "Rafi", parents: "" },
          opening: "",
          closing: "",
          coverUrl: "",
          gallery: [],
          events: [],
          stories: [],
          gifts: [],
          showGifts: false,
          musicUrl: "",
          rsvpDeadline: "",
        },
        guests: [],
        rsvps: [],
        wishes: [],
        orders,
        service: { status: "none", brief: "", revisions: 0, messages: [] },
        previewToken: "fixture-preview-token",
        createdAt: "2026-09-26T00:00:00Z",
        updatedAt: "2026-09-26T00:00:00Z",
      },
    ],
  };
}

test("sandbox checkout uses server prices and recovers an uncertain order without creating another", async ({
  page,
}) => {
  const workspace = paymentWorkspace();
  const mutations: Mutation[] = [];
  let readsAfterCheckout = 0;
  await page.route("**/api/workspace", async (route) => {
    if (route.request().method() === "GET") {
      if (mutations.some((mutation) => mutation.action === "checkout"))
        readsAfterCheckout++;
      await route.fulfill({ json: workspace });
      return;
    }
    const mutation = route.request().postDataJSON() as Mutation;
    mutations.push(mutation);
    if (mutation.action === "checkout") {
      workspace.invitations[0].orders = [
        {
          id: "order-uncertain",
          plan: "mandiri",
          amount: 173000,
          status: "pending",
          checkoutState: "uncertain",
          createdAt: "2026-09-26T00:01:00Z",
        },
      ];
      // The provider call failed after the server reserved the order.
      await route.fulfill({
        status: 503,
        json: { error: "Sesi sandbox belum dapat dipastikan." },
      });
      return;
    }
    await route.fulfill({ json: workspace });
  });
  await page.goto("/app?section=billing&id=invitation-payment-ui");
  await expect(
    page.getByText("Mode uji Midtrans sandbox.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("Fitur paket dari server", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".plan-price").first()).toContainText(
    money(173000),
  );
  await expect(page.locator(".plan-price").last()).toContainText(money(421000));
  await expect(page.locator(".pricing-grid")).not.toContainText(money(249000));
  await expect(page.locator(".pricing-grid")).not.toContainText(money(599000));

  await page
    .getByRole("button", { name: "Pilih paket", exact: true })
    .first()
    .click();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Sesi sandbox belum dapat dipastikan." }),
  ).toBeVisible();
  await expect(
    page.getByText("Hasil pembuatan sesi belum pasti.", { exact: false }),
  ).toBeVisible();
  expect(readsAfterCheckout).toBeGreaterThan(0);
  expect(mutations).toHaveLength(1);
  expect(mutations[0].action).toBe("checkout");
  expect(mutations[0].invitationId).toBe("invitation-payment-ui");
  expect(Object.keys(mutations[0].payload || {}).sort()).toEqual([
    "idempotencyKey",
    "plan",
  ]);
  expect(mutations[0].payload?.plan).toBe("mandiri");
  expect(mutations[0].payload?.idempotencyKey).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const checkoutButtons = page.getByRole("button", {
    name: "Periksa pesanan yang berjalan",
    exact: true,
  });
  await expect(checkoutButtons).toHaveCount(2);
  await expect(checkoutButtons.nth(0)).toBeDisabled();
  await expect(checkoutButtons.nth(1)).toBeDisabled();
  await expect(page.getByRole("link", { name: "Buka sandbox" })).toHaveCount(0);

  await page
    .getByRole("button", { name: "Periksa status", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Status pembayaran diperbarui",
  );
  expect(mutations[1]).toMatchObject({
    action: "refreshPayment",
    invitationId: "invitation-payment-ui",
    payload: { orderId: "order-uncertain" },
  });
  expect(
    mutations.filter((mutation) => mutation.action === "checkout"),
  ).toHaveLength(1);
});

test("sandbox billing never offers unsafe or production checkout links", async ({
  page,
}) => {
  const urls = [
    "https://app.midtrans.com/snap/v2/vtweb/production-token",
    "javascript:alert('payment')",
    "https://user:password@app.sandbox.midtrans.com/snap/v2/vtweb/credential-token",
    "https://app.sandbox.midtrans.com.evil.example/snap/v2/vtweb/host-token",
    "https://app.sandbox.midtrans.com/snap/v2/vtweb/hash-token#fragment",
    `https://app.sandbox.midtrans.com/snap/v2/vtweb/${"x".repeat(2048)}`,
    "https://app.sandbox.midtrans.com/snap/v2/vtweb/valid-test-token",
  ];
  const workspace = paymentWorkspace(
    urls.map((paymentUrl, index) => ({
      id: `order-link-${index}`,
      plan: "mandiri",
      amount: 173000,
      status: "pending",
      checkoutState: "ready",
      createdAt: "2026-09-26T00:00:00Z",
      paymentUrl,
    })),
  );
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.goto("/app?section=billing&id=invitation-payment-ui");
  const checkout = page.getByRole("link", { name: "Buka sandbox" });
  await expect(checkout).toHaveCount(1);
  await expect(checkout).toHaveAttribute("href", urls.at(-1)!);
  await expect(checkout).toHaveAttribute("rel", "noopener noreferrer");

  // The sandbox readiness flag closes both new checkout and status actions.
  workspace.payments!.enabled = false;
  await page.reload();
  await expect(
    page.getByText("Pembayaran belum dibuka.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Buka sandbox" })).toHaveCount(0);
  for (const button of await page
    .getByRole("button", { name: "Periksa status", exact: true })
    .all())
    await expect(button).toBeDisabled();
});

test("historical paid orders do not claim activation or offer unsupported renewals", async ({
  page,
}) => {
  const workspace = paymentWorkspace([
    {
      id: "historical-paid-order",
      plan: "mandiri",
      amount: 173000,
      status: "paid",
      paidAt: "2026-09-26T00:00:00Z",
      createdAt: "2026-09-26T00:00:00Z",
    },
  ]);
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: workspace }),
  );
  for (const state of [
    { expiry: undefined, status: "paid" },
    { expiry: "2020-01-01T00:00:00Z", status: "paid" },
    { expiry: "invalid-date", status: "paid" },
    { expiry: undefined, status: "refunded" },
    { expiry: undefined, status: "review" },
  ] as const) {
    workspace.invitations[0].expiresAt = state.expiry;
    workspace.invitations[0].orders[0].status = state.status;
    await page.goto("/app?section=billing&id=invitation-payment-ui");
    await expect(page.locator(".success-box")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Paket aktif", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText("Pembelian ulang dan perpanjangan belum tersedia", {
        exact: false,
      }),
    ).toBeVisible();
    const buttons = page.getByRole("button", {
      name: "Hubungi admin untuk aktivasi",
      exact: true,
    });
    await expect(buttons).toHaveCount(2);
    await expect(buttons.nth(0)).toBeDisabled();
    await expect(buttons.nth(1)).toBeDisabled();
  }
});

test("assisted upgrade charges the server price minus actual paid credit and preserves validity", async ({
  page,
}) => {
  const workspace = paymentWorkspace([
    {
      id: "active-mandiri-order",
      plan: "mandiri",
      amount: 211000,
      status: "paid",
      paidAt: "2026-09-26T00:00:00Z",
      createdAt: "2026-09-26T00:00:00Z",
    },
  ]);
  workspace.invitations[0].expiresAt = new Date(
    Date.now() + 31 * 24 * 60 * 60 * 1000,
  ).toISOString();
  await page.route("**/api/workspace", (route) =>
    route.fulfill({ json: workspace }),
  );
  await page.goto("/app?section=billing&id=invitation-payment-ui");
  await expect(page.locator(".success-box")).toContainText(
    "aktif untuk pengujian sandbox",
  );
  const upgradeCard = page.locator(".plan-card").filter({
    has: page.getByRole("heading", { name: "Dirangkai Bersama", exact: true }),
  });
  await expect(upgradeCard.locator(".plan-price")).toContainText(money(210000));
  await expect(upgradeCard.locator(".plan-price")).toContainText(
    "biaya peningkatan",
  );
  await expect(upgradeCard.locator(".plan-price")).not.toContainText(
    money(421000),
  );
  await expect(upgradeCard).toContainText("Masa berlaku tetap sampai");
  await expect(
    upgradeCard.getByRole("button", {
      name: "Tingkatkan ke bantuan admin",
      exact: true,
    }),
  ).toBeEnabled();

  // A nonpositive upgrade cannot become a free or negative checkout.
  workspace.invitations[0].orders[0].amount = 500000;
  await page.reload();
  await expect(upgradeCard.locator(".plan-price")).toContainText(
    "Perlu pemeriksaan",
  );
  await expect(
    upgradeCard.getByRole("button", {
      name: "Peningkatan belum tersedia",
      exact: true,
    }),
  ).toBeDisabled();
});
