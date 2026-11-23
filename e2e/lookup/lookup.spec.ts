import { expect, test, type Page } from "@playwright/test";

// The e2e server has no RapidAPI key, so the eBay card shows its "not set up" state and never calls out.
// PriceCharting needs no key, so every test stubs /api/lookup in the browser. No test reaches the real site.

const PRICECHARTING_OK = {
  query: "chrono trigger",
  sources: [
    {
      source: "pricecharting",
      label: "PriceCharting",
      status: "ok",
      cached: false,
      fetchedAt: "2026-11-23T12:00:00.000Z",
      data: {
        results: [
          {
            id: "6889",
            source: "pricecharting",
            title: "Chrono Trigger",
            itemTitle: "Chrono Trigger (Super Nintendo)",
            searchText: "Chrono Trigger Super Nintendo",
            subtitle: "Super Nintendo",
            prices: [
              { key: "loose", label: "Loose", cents: 27085 },
              { key: "complete", label: "Complete", cents: 78300 },
              { key: "new", label: "New", cents: null },
            ],
            url: "https://www.pricecharting.com/game/super-nintendo/chrono-trigger",
            imageUrl: null,
            identifier: null,
          },
        ],
        summary: [],
        searchUrl: "https://www.pricecharting.com/search-products?q=chrono+trigger&type=prices",
        notice: null,
        quota: null,
      },
    },
  ],
};

async function stubLookup(page: Page, body: unknown): Promise<string[]> {
  const requested: string[] = [];
  await page.route("**/api/lookup?**", async (route) => {
    requested.push(route.request().url());
    await route.fulfill({ json: body });
  });
  return requested;
}

test("a search from ?q= shows PriceCharting results and the eBay setup note", async ({ page }) => {
  const requested = await stubLookup(page, PRICECHARTING_OK);
  await page.goto("/lookup?q=chrono+trigger");

  await expect(page.getByRole("searchbox", { name: "Search by title or barcode" })).toHaveValue("chrono trigger");

  const priceCharting = page.getByRole("region", { name: "PriceCharting" });
  await expect(priceCharting.getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
  await expect(priceCharting.getByText("Super Nintendo", { exact: true })).toBeVisible();
  await expect(priceCharting.getByText("$270.85")).toBeVisible();
  await expect(priceCharting.getByText("$783.00")).toBeVisible();
  await expect(priceCharting.getByRole("link", { name: /Add to inventory/ })).toHaveAttribute(
    "href",
    "/inventory/new?title=Chrono+Trigger+%28Super+Nintendo%29",
  );
  await expect(priceCharting.getByRole("link", { name: /View on PriceCharting/ })).toHaveAttribute(
    "href",
    "https://www.pricecharting.com/game/super-nintendo/chrono-trigger",
  );

  await expect(page.getByRole("region", { name: "eBay sold" }).getByText("eBay sold is not set up")).toBeVisible();
  expect(requested.every((url) => url.includes("source=pricecharting"))).toBe(true);
});

test("searching from the box puts the query in the address", async ({ page }) => {
  await stubLookup(page, PRICECHARTING_OK);
  await page.goto("/lookup");
  await expect(page.getByText("Look up a price")).toBeVisible();
  await page.getByRole("searchbox", { name: "Search by title or barcode" }).fill("chrono trigger");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/\/lookup\?q=chrono\+trigger$/);
  await expect(page.getByRole("region", { name: "PriceCharting" }).getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
});

test("a barcode search passes the barcode to Add item", async ({ page }) => {
  await stubLookup(page, PRICECHARTING_OK);
  await page.goto("/lookup?q=045496590420");
  await expect(page.getByRole("region", { name: "PriceCharting" }).getByRole("link", { name: /Add to inventory/ })).toHaveAttribute(
    "href",
    "/inventory/new?title=Chrono+Trigger+%28Super+Nintendo%29&identifier=045496590420&identifierType=upc",
  );
});

test("a failing source shows its own error and can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/api/lookup?**", async (route) => {
    if (fail) {
      await route.fulfill({
        json: {
          query: "chrono trigger",
          sources: [
            { source: "pricecharting", label: "PriceCharting", status: "error", code: "unavailable", message: "PriceCharting did not answer. Try again in a moment." },
          ],
        },
      });
    } else {
      await route.fulfill({ json: PRICECHARTING_OK });
    }
  });
  await page.goto("/lookup?q=chrono+trigger");
  const priceCharting = page.getByRole("region", { name: "PriceCharting" });
  await expect(priceCharting.getByRole("alert")).toContainText("PriceCharting did not answer");
  fail = false;
  await priceCharting.getByRole("button", { name: "Try again" }).click();
  await expect(priceCharting.getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
});

test("controls on the lookup page are at least 44px tall", async ({ page }) => {
  await stubLookup(page, PRICECHARTING_OK);
  await page.goto("/lookup?q=chrono+trigger");
  const priceCharting = page.getByRole("region", { name: "PriceCharting" });
  await expect(priceCharting.getByRole("heading", { name: "Chrono Trigger" })).toBeVisible();
  const controls = page.locator("main").locator("a, button, input");
  for (const control of await controls.all()) {
    const box = await control.boundingBox();
    expect(box?.height ?? 0, await control.textContent() ?? "input").toBeGreaterThanOrEqual(44);
  }
});
