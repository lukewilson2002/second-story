import { expect, test } from "@playwright/test";

/**
 * The app's own half of the photo flow, with Cloudinary's two hosts answered in the browser.
 * It lives in the live project because the uploader only shows when the Cloudinary variables are set,
 * and the default e2e server blanks them. Nothing is uploaded.
 * It checks: the sign route, the form post the browser builds, saving the row, rendering it after a reload,
 * the inventory thumbnail, reordering and deleting.
 */
test("photos: signed upload request, saved row, thumbnail, reorder and delete, with Cloudinary stubbed", async ({ page }) => {
  const image = await (async () => {
    await page.goto("/inventory");
    return page.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 } });
  })();

  const uploads: { fields: string[]; publicId: string }[] = [];
  await page.route("https://api.cloudinary.com/**", async (route) => {
    const body = route.request().postData() ?? "";
    const field = (name: string) => new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)\\r\\n`).exec(body)?.[1] ?? "";
    const publicId = field("public_id");
    uploads.push({ fields: [...body.matchAll(/name="([a-z_]+)"/g)].map((match) => match[1] ?? ""), publicId });
    await route.fulfill({
      json: { public_id: publicId, width: 64, height: 64, secure_url: `https://res.cloudinary.com/stub/image/upload/v1/${publicId}.png` },
    });
  });
  await page.route("https://res.cloudinary.com/**", (route) => route.fulfill({ contentType: "image/png", body: image }));

  const title = `Stubbed photo test ${Date.now()}`;
  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Book" });
  await page.getByLabel("Unit cost").fill("1.00");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);

  const input = page.locator('main input[type="file"]');
  await input.setInputFiles({ name: "one.png", mimeType: "image/png", buffer: image });
  await expect(page.getByRole("img", { name: "Photo 1" })).toBeVisible();
  await input.setInputFiles({ name: "two.png", mimeType: "image/png", buffer: image });
  await expect(page.getByRole("img", { name: "Photo 2" })).toBeVisible();

  expect(uploads).toHaveLength(2);
  for (const upload of uploads) {
    // The secret is never a form field. The server chose the public id, inside the owner's folder.
    expect([...upload.fields].sort()).toEqual(["api_key", "file", "public_id", "signature", "timestamp"]);
    expect(upload.publicId).toMatch(/^second-story\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
  }

  const sources = async () =>
    page.getByRole("img", { name: /^Photo \d$/ }).evaluateAll((images) => images.map((element) => element.getAttribute("src") ?? ""));
  await page.reload();
  const saved = await sources();
  expect(saved).toHaveLength(2);
  // Booleans, not the addresses themselves: a failure message would print the cloud name.
  expect(saved[0]?.includes(uploads[0]?.publicId ?? "missing"), "photo 1 is the first upload").toBe(true);
  expect(saved[1]?.includes(uploads[1]?.publicId ?? "missing"), "photo 2 is the second upload").toBe(true);
  await expect
    .poll(() => page.getByRole("img", { name: "Photo 1" }).evaluate((element) => element instanceof HTMLImageElement && element.naturalWidth > 0))
    .toBe(true);

  await page.getByRole("button", { name: "Move photo 2 earlier" }).click();
  await expect.poll(async () => (await sources())[0]?.includes(uploads[1]?.publicId ?? "missing") ?? false).toBe(true);

  // The first photo is the thumbnail in the inventory table.
  await page.goto(`/inventory?q=${encodeURIComponent(title)}`);
  const thumbnail = page.getByRole("table", { name: "Inventory" }).locator("tbody img").first();
  await expect(thumbnail).toBeVisible();
  expect(((await thumbnail.getAttribute("src")) ?? "").includes(uploads[1]?.publicId ?? "missing"), "the thumbnail is the first photo").toBe(true);

  await page.goBack();
  await page.getByRole("button", { name: "Delete photo 1" }).click();
  await expect(page.getByRole("img", { name: /^Photo \d$/ })).toHaveCount(1);
  await page.getByRole("button", { name: "Delete photo 1" }).click();
  await expect(page.getByRole("img", { name: /^Photo \d$/ })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("img", { name: /^Photo \d$/ })).toHaveCount(0);
});
