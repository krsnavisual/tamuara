import { test, expect } from "@playwright/test";
import type { Workspace } from "../src/lib/types";

test("marketing and theme samples work on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.screenshot({
    path: "test-results/marketing-desktop.png",
    fullPage: true,
  });
  await page.goto("/tema");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/demo/floral");
  await page.getByRole("button", { name: "Buka Undangan" }).click();
  await expect(
    page.getByRole("heading", { name: "Mempelai", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/marketing-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("couple dashboard and editor render on desktop and mobile", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/masuk");
  await page.getByRole("button", { name: "Demo pasangan" }).click();
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  const workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  const inv = workspace.invitations[0];
  await page.goto(`/app?section=editor&id=${inv.id}`);
  await expect(
    page.getByRole("heading", { name: "Tentang kalian berdua" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/editor-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const section of [
    "overview",
    "editor",
    "guests",
    "responses",
    "themes",
    "billing",
    "help",
  ]) {
    await page.goto(`/app?section=${section}&id=${inv.id}`);
    await expect(page.locator(".app-main")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      `Overflow in ${section}`,
    ).toBe(true);
  }
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Buka navigasi" }).click();
  await expect(
    page.getByRole("button", { name: "Buku tamu", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("new couple creates, edits, pays in demo, publishes and receives a real guest RSVP", async ({
  page,
  browser,
}) => {
  const email = `browser-${Date.now()}@example.test`;
  await page.goto("/daftar");
  await page.getByLabel("Nama kalian").fill("Nadia & Rafi");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Kata sandi").fill("Local-test-Strong-825!");
  await page.getByRole("button", { name: "Buat akun", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Buat undangan pertama" }).click();
  await page.getByLabel("Nama mempelai pertama").fill("Nadia");
  await page.getByLabel("Nama mempelai kedua").fill("Rafi");
  await page.getByRole("button", { name: "Mulai merangkai" }).click();
  await expect(
    page.getByRole("heading", { name: "Tentang kalian berdua" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Acara", exact: true }).click();
  await page.getByLabel("Tanggal", { exact: true }).fill("2027-10-24");
  await page.getByLabel("Nama tempat").fill("Taman Cerita");
  await page
    .getByLabel("Alamat", { exact: true })
    .fill("Jalan Kenangan 12, Yogyakarta");
  await page
    .getByRole("button", { name: "Simpan draf", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Perubahan tersimpan." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Paket & pembayaran", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Pilih paket", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Simulasikan lunas" }).click();
  await expect(page.locator(".success-box")).toContainText("aktif");
  let workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  let inv = workspace.invitations[0];
  await page.goto(`/app?section=editor&id=${inv.id}`);
  await page.getByRole("button", { name: "Terbitkan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("berhasil diterbitkan");
  await page.getByRole("button", { name: "Buku tamu", exact: true }).click();
  await page.getByRole("button", { name: "Tambah tamu", exact: true }).click();
  await page.getByLabel("Nama penerima / keluarga").fill("Keluarga Uji");
  await page.getByLabel("Jumlah orang yang diundang").fill("3");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Tambah tamu", exact: true })
    .click();
  await expect(page.getByText("Keluarga Uji", { exact: true })).toBeVisible();
  workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  inv = workspace.invitations[0];
  const guest = inv.guests.find((g) => g.name === "Keluarga Uji")!;
  const guestContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const guestPage = await guestContext.newPage();
  await guestPage.goto(
    new URL(`/u/${inv.slug}?guest=${guest.token}`, page.url()).toString(),
  );
  await guestPage.getByRole("button", { name: "Buka Undangan" }).click();
  await guestPage.getByLabel("Jumlah orang jika hadir").selectOption("2");
  await guestPage.getByRole("button", { name: "Kirim Konfirmasi" }).click();
  await expect(
    guestPage.getByText("Akan hadir · 2 orang — dapat diperbarui"),
  ).toBeVisible();
  await guestPage
    .getByLabel(/Ucapan untuk/)
    .fill("Semoga bahagia selalu, Nadia dan Rafi.");
  await guestPage.getByRole("button", { name: "Kirim Ucapan" }).click();
  await expect(guestPage.getByRole("status")).toContainText(
    "setelah disetujui",
  );
  await page.goto(`/app?section=responses&id=${inv.id}`);
  await expect(
    page.getByRole("cell", { name: "2 / 3", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Ucapan & doa/ }).click();
  await page.getByRole("button", { name: "Tampilkan", exact: true }).click();
  await expect(page.getByText("Ditampilkan", { exact: true })).toBeVisible();
  await guestPage.reload();
  await guestPage.getByRole("button", { name: "Buka Undangan" }).click();
  await expect(
    guestPage.getByText("Semoga bahagia selalu, Nadia dan Rafi.", {
      exact: true,
    }),
  ).toBeVisible();
  await guestContext.close();
});
