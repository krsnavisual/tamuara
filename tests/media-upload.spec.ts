import { test, expect } from "@playwright/test";
import { MAX_IMAGE_UPLOAD_BYTES } from "../src/lib/media-upload";
import type { Workspace } from "../src/lib/types";

test("editor validates every selected photo before starting any upload", async ({
  page,
}) => {
  await page.goto("/masuk");
  await page.getByRole("button", { name: "Demo pasangan" }).click();
  await expect(
    page.getByRole("heading", { name: /Selamat datang/ }),
  ).toBeVisible();
  const workspace = (await (
    await page.request.get("/api/workspace")
  ).json()) as Workspace;
  await page.goto(`/app?section=editor&id=${workspace.invitations[0].id}`);
  await page.getByRole("tab", { name: "Galeri", exact: true }).click();
  await expect(page.getByText(/maksimal 4 MB per foto/)).toBeVisible();

  let uploads = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/media"
    )
      uploads++;
  });
  await page.locator('.gallery-add input[type="file"]').setInputFiles([
    {
      name: "small.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from([1, 2, 3]),
    },
    {
      name: "large.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.alloc(MAX_IMAGE_UPLOAD_BYTES + 1),
    },
  ]);
  await expect(
    page.getByRole("alert").filter({ hasText: "large.jpg" }),
  ).toContainText("large.jpg: Ukuran gambar maksimal 4 MB.");
  expect(uploads).toBe(0);
  await expect(page.getByText("Mengoptimalkan foto…")).toHaveCount(0);
});
