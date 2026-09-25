import { test, expect } from "@playwright/test";
import type { Mutation, Workspace } from "../src/lib/types";

test("admin prepares a draft and owner approves the current version", async ({
  page,
  browser,
}) => {
  const customer = await browser.newContext({
    baseURL: "http://127.0.0.1:3001",
  });
  const signup = await customer.request.post("/api/auth", {
    data: {
      action: "register",
      name: "Sinta & Danu",
      email: `assist-${Date.now()}@example.test`,
      password: "Local-Strong-987!",
    },
  });
  expect(signup.ok()).toBe(true);
  const mutate = async (body: Mutation) => {
    const response = await customer.request.post("/api/workspace", {
      data: body,
    });
    expect(response.ok()).toBe(true);
    return (await response.json()) as Workspace;
  };
  let inv = (
    await mutate({
      action: "create",
      payload: { brideName: "Sinta", groomName: "Danu", theme: "floral" },
    })
  ).invitations[0];
  const content = structuredClone(inv.content);
  content.events[0] = {
    ...content.events[0],
    date: "2027-10-20",
    location: "Taman Bahagia",
    address: "Jakarta, lokasi contoh",
  };
  inv = (
    await mutate({
      action: "save",
      invitationId: inv.id,
      version: inv.version,
      payload: { content, theme: inv.theme, slug: inv.slug },
    })
  ).invitations[0];
  inv = (
    await mutate({
      action: "checkout",
      invitationId: inv.id,
      payload: { plan: "assisted" },
    })
  ).invitations[0];
  inv = (
    await mutate({
      action: "demoPay",
      invitationId: inv.id,
      payload: { orderId: inv.orders[0].id },
    })
  ).invitations[0];
  await mutate({
    action: "requestAssistance",
    invitationId: inv.id,
    payload: { brief: "Mohon bantu memeriksa susunan undangan kami." },
  });
  await page.goto("/masuk");
  await page.getByRole("button", { name: "Demo admin" }).click();
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.goto(`/admin?section=jobs&id=${inv.id}`);
  await page.getByRole("button", { name: "Mulai kerjakan" }).click();
  await expect(
    page.getByText("Sedang dirangkai", { exact: true }).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Minta pemeriksaan pasangan" })
    .click();
  await expect(
    page.getByText("Menunggu persetujuan", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buka editor" }).click();
  await expect(
    page.getByRole("heading", { name: "Tentang kalian berdua" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Terbitkan", exact: true }),
  ).toHaveCount(0);
  const ownerPage = await customer.newPage();
  await ownerPage.goto(`/app?section=help&id=${inv.id}`);
  await ownerPage.getByRole("button", { name: "Setujui draf" }).click();
  await expect(ownerPage.getByText("Disetujui", { exact: true })).toBeVisible();
  await page.goto(`/admin?section=jobs&id=${inv.id}`);
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(
    page.getByText("Selesai", { exact: true }).first(),
  ).toBeVisible();
  await customer.close();
});

test("CSV import validates rows, then persists valid recipients", async ({
  page,
}) => {
  await page.goto("/masuk");
  await page.getByRole("button", { name: "Demo pasangan" }).click();
  await expect(page.locator(".app-main")).toBeVisible();
  await page.getByRole("button", { name: "Buku tamu", exact: true }).click();
  const input = page.locator("input[type=file]");
  await input.setInputFiles({
    name: "invalid.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("nama,kelompok,kuota\n,Keluarga,0"),
  });
  await expect(page.getByRole("dialog")).toContainText("nama wajib diisi");
  await expect(
    page.getByRole("button", { name: /Tambahkan 1 penerima/ }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Batal", exact: true }).click();
  const name = `Sahabat CSV ${Date.now()}`;
  await input.setInputFiles({
    name: "guests.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`nama,kelompok,kuota\n${name},Sahabat,2`),
  });
  await page.getByRole("button", { name: /Tambahkan 1 penerima/ }).click();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  // Remove only the test-created recipient so the user-facing seed stays unchanged.
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Hapus ${name}`, exact: true })
    .click();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
});
