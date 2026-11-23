import { readFileSync } from "node:fs";
import { expect, test, type Page, type Response } from "@playwright/test";

/**
 * Tests against the real Cloudinary, RapidAPI (eBay) and PriceCharting services.
 * They only run with `E2E_REAL_SERVICES=1 pnpm test:e2e`, which starts the server with the keys from .env.local.
 * Nothing here prints a key, a signature or an image URL. Assertions compare booleans and counts, never those values.
 *
 * eBay allows 50 requests a month. The live database keeps its 24-hour cache between runs, so a repeat run on the same
 * day spends none. Do not change QUERY without a reason: a new query is a new request.
 */

// The lookup page searches every source for whatever is typed, so both tests use one query and share one eBay request.
const QUERY = "chrono trigger";

interface SourceBody {
  status: string;
  cached?: boolean;
  fetchedAt?: string;
  code?: string;
  message?: string;
  data?: { results: unknown[]; quota: { remaining: number | null; limit: number | null } | null };
}

async function sourceOutcome(response: Response, source: string): Promise<SourceBody> {
  const body = (await response.json()) as { sources: (SourceBody & { source: string })[] };
  const outcome = body.sources.find((entry) => entry.source === source);
  if (!outcome) throw new Error(`The lookup answer has no ${source} entry.`);
  return outcome;
}

function waitForSource(page: Page, source: string): Promise<Response> {
  return page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/lookup" && url.searchParams.getAll("source").includes(source);
  });
}

/** Reads one value from .env.local for the Cloudinary check after the test. The value is used in a request and never logged. */
function localEnv(name: string): string {
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((entry) => entry.startsWith(`${name}=`));
  return (line ?? "").slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

test("eBay sold listings: a real search renders, and a repeat is answered from the 24-hour cache", async ({ page }) => {
  test.setTimeout(90_000);
  const firstResponse = waitForSource(page, "ebay");
  await page.goto(`/lookup?q=${encodeURIComponent(QUERY)}`);
  const first = await sourceOutcome(await firstResponse, "ebay");
  // A failure is not retried: an error can still count against the monthly allowance.
  expect(first.status, `eBay answered ${first.status} ${first.code ?? ""}: ${first.message ?? ""}`).toBe("ok");
  expect(first.data?.results.length ?? 0).toBeGreaterThan(0);

  const card = page.locator('[aria-labelledby="lookup-ebay-heading"]');
  await expect(card.getByRole("heading", { level: 3 }).first()).toBeVisible();
  await expect(card.getByText(/^\$[\d,]+\.\d{2}$/).first()).toBeVisible();
  await expect(card.getByText(/requests left/)).toBeVisible();
  await expect(card.getByRole("link", { name: /^Add to inventory/ }).first()).toHaveAttribute("href", /^\/inventory\/new\?title=/);

  const secondResponse = waitForSource(page, "ebay");
  await page.reload();
  const second = await sourceOutcome(await secondResponse, "ebay");
  expect(second.status).toBe("ok");
  expect(second.cached).toBe(true);
  expect(second.fetchedAt).toBe(first.fetchedAt);
  // The count is the one stored with the first answer. A fresh call would report one fewer.
  expect(second.data?.quota?.remaining).toBe(first.data?.quota?.remaining);
  expect(second.data?.results.length).toBe(first.data?.results.length);
  await expect(card.getByText(/^Saved result from/)).toBeVisible();

  // Counts only. They show in the run's output so the owner can see what the run spent.
  console.log(
    `eBay: first answer ${first.cached ? "came from the cache" : "was a live request"}; ${String(first.data?.quota?.remaining)} of ${String(first.data?.quota?.limit)} requests left as of that request; ${String(first.data?.results.length)} results`,
  );
});

test("PriceCharting: a real search for a well-known game renders parsed prices", async ({ page }) => {
  test.setTimeout(60_000);
  const responsePromise = waitForSource(page, "pricecharting");
  await page.goto(`/lookup?q=${encodeURIComponent(QUERY)}`);
  const outcome = await sourceOutcome(await responsePromise, "pricecharting");
  expect(outcome.status, `PriceCharting answered ${outcome.status}: ${outcome.message ?? ""}`).toBe("ok");
  expect(outcome.data?.results.length ?? 0).toBeGreaterThan(0);

  const card = page.locator('[aria-labelledby="lookup-pricecharting-heading"]');
  const row = card.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 3, name: "Chrono Trigger", exact: true }) }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText("Loose", { exact: true })).toBeVisible();
  // A loose Chrono Trigger cartridge has sold for well over $50 for years. A parser reading the wrong column would not land in this range.
  const prices = await row.locator("dd").allTextContents();
  const loose = Number((prices[0] ?? "").replace(/[$,]/g, ""));
  expect(loose).toBeGreaterThan(50);
  expect(loose).toBeLessThan(5000);
  await expect(row.getByRole("link", { name: /^Add to inventory/ })).toHaveAttribute("href", /title=Chrono(\+|%20)Trigger/);
  console.log(`PriceCharting: ${String(outcome.data?.results.length)} results; first Chrono Trigger row: ${prices.join(", ")}`);
});

test("Cloudinary: a photo is uploaded through the signed flow, saved, shown, and deleted again", async ({ page }) => {
  test.setTimeout(120_000);
  const title = `Live photo test ${Date.now()}`;
  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Book" });
  await page.getByLabel("Unit cost").fill("1.00");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);

  // A screenshot of part of the page is a small, valid PNG.
  const image = await page.screenshot({ clip: { x: 0, y: 0, width: 64, height: 64 } });
  const photo = page.getByRole("img", { name: "Photo 1" });
  let publicId: string | null = null;
  try {
    await page.locator('main input[type="file"]').setInputFiles({ name: "live-test.png", mimeType: "image/png", buffer: image });
    const refused = page.getByRole("main").getByRole("alert");
    await expect(photo.or(refused).first()).toBeVisible({ timeout: 30_000 });
    if (await refused.isVisible()) throw new Error(`The upload was refused: ${(await refused.textContent()) ?? ""}`);

    // After a reload the photo comes from the saved row, not from the upload's own preview.
    await page.reload();
    await expect(photo).toBeVisible();
    await expect.poll(() => photo.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    publicId = await photo.evaluate((element) => {
      const match = /\/(second-story\/[0-9a-f-]+\/[A-Za-z0-9_-]+)(?:\.\w+)?(?:\?|$)/.exec(element.getAttribute("src") ?? "");
      return match?.[1] ?? null;
    });
    expect(publicId !== null, "the photo's address is in the owner's own folder").toBe(true);

    // The inventory table's thumbnail is the first photo.
    await page.goto(`/inventory?q=${encodeURIComponent(title)}`);
    const thumbnail = page.getByRole("table", { name: "Inventory" }).locator("tbody img").first();
    await expect(thumbnail).toBeVisible();
    await expect.poll(() => thumbnail.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0)).toBe(true);
    await page.goBack();
  } finally {
    // Runs after a failed assertion too, so a test photo is never left on the owner's account.
    if (await photo.count()) {
      await page.getByRole("button", { name: "Delete photo 1" }).click();
      await expect(photo).toHaveCount(0);
    }
  }

  // Ask Cloudinary itself whether the asset is gone. Only the status is compared.
  const auth = Buffer.from(`${localEnv("CLOUDINARY_API_KEY")}:${localEnv("CLOUDINARY_API_SECRET")}`).toString("base64");
  const check = await fetch(
    `https://api.cloudinary.com/v1_1/${encodeURIComponent(localEnv("CLOUDINARY_CLOUD_NAME"))}/resources/image/upload/${publicId ?? ""}`,
    { headers: { Authorization: `Basic ${auth}` } },
  );
  expect(check.status, "Cloudinary no longer has the test photo").toBe(404);
});
