import { expect, test, type Page } from "@playwright/test";

/** The row total a DataTable prints under itself: "Showing 1 to 7 of 12 listings", "3 items" or "No sales". */
async function tableTotal(page: Page): Promise<number> {
  const footer = page.locator("main").getByText(/^(Showing [\d,]+ to [\d,]+ of [\d,]+ \w+|[\d,]+ \w+|No \w+)$/).filter({ visible: true }).last();
  const text = (await footer.textContent()) ?? "";
  if (text.startsWith("No ")) return 0;
  const match = /of ([\d,]+) \w+$/.exec(text) ?? /^([\d,]+) \w+$/.exec(text);
  if (!match?.[1]) throw new Error(`No table total in "${text}"`);
  return Number(match[1].replaceAll(",", ""));
}

test("each needs-attention count matches the filtered page it links to", async ({ page }) => {
  await page.goto("/");
  const counts = new Map<string, string>();
  for (const href of [
    "/inventory?status=in_stock",
    "/listings?filter=below-minimum",
    "/listings?filter=stale",
    "/listings?filter=still-up",
    "/sales?filter=commission-owed",
  ]) {
    const link = page.locator(`main a[href="${href}"]`).filter({ visible: true });
    await expect(link, href).toHaveCount(1);
    counts.set(href, ((await link.textContent()) ?? "").trim());
  }

  for (const [href, label] of counts) {
    await page.goto(href);
    if (href.startsWith("/sales")) {
      // The dashboard row shows the amount owed, and the sales page shows the same amount in its banner.
      const amount = /\$[\d,]+\.\d{2}/.exec(label)?.[0];
      expect(amount, label).toBeDefined();
      await expect(page.locator("main").getByText(amount ?? "", { exact: true }).first()).toBeVisible();
    } else {
      const count = Number(/^[\d,]+/.exec(label)?.[0]?.replaceAll(",", ""));
      expect(await tableTotal(page), `${href} (dashboard says "${label}")`).toBe(count);
    }
  }
});

test("items selected in inventory start a listing with those items", async ({ page }) => {
  await page.goto("/inventory?status=in_stock");
  const table = page.getByRole("table", { name: "Inventory" });
  const titles: string[] = [];
  for (const index of [1, 2]) {
    const row = table.getByRole("row").nth(index);
    const title = ((await row.getByRole("link").first().textContent()) ?? "").trim();
    titles.push(title);
    await row.getByRole("checkbox").check();
  }
  await expect(page.getByText("2 selected")).toBeVisible();
  await page.getByRole("link", { name: "Create listing" }).click();
  await expect(page).toHaveURL(/\/listings\/new\?items=[0-9a-f-]{36}(,|%2C)[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: "New listing" })).toBeVisible();
  for (const title of titles) await expect(page.locator("main").getByText(title, { exact: true }).first()).toBeVisible();
});

test("a lookup result opens Add item with its title and barcode filled in", async ({ page }) => {
  await page.route("**/api/lookup?**", async (route) => {
    const source = new URL(route.request().url()).searchParams.get("source");
    await route.fulfill({
      json: {
        query: "045496590420",
        sources:
          source === "ebay"
            ? [{ source: "ebay", label: "eBay sold listings", status: "not_configured" }]
            : [
                {
                  source: "pricecharting",
                  label: "PriceCharting",
                  status: "ok",
                  cached: false,
                  fetchedAt: "2026-11-23T12:00:00.000Z",
                  data: {
                    results: [
                      {
                        id: "1",
                        source: "pricecharting",
                        title: "Mario Kart 8 Deluxe",
                        itemTitle: "Mario Kart 8 Deluxe (Nintendo Switch)",
                        searchText: "Mario Kart 8 Deluxe Nintendo Switch",
                        subtitle: "Nintendo Switch",
                        prices: [{ key: "loose", label: "Loose", cents: 3500 }],
                        url: "https://www.pricecharting.com/game/nintendo-switch/mario-kart-8-deluxe",
                        imageUrl: null,
                        identifier: null,
                      },
                    ],
                    summary: [],
                    searchUrl: "https://www.pricecharting.com/search-products?q=045496590420&type=prices",
                    notice: null,
                    quota: null,
                  },
                },
              ],
      },
    });
  });
  await page.goto("/lookup?q=045496590420");
  await page.getByRole("region", { name: "PriceCharting" }).getByRole("link", { name: /Add to inventory/ }).click();
  await expect(page).toHaveURL(/\/inventory\/new\?/);
  await expect(page.getByLabel("Title")).toHaveValue("Mario Kart 8 Deluxe (Nintendo Switch)");
  await expect(page.getByLabel("Identifier 1 type")).toHaveValue("upc");
  await expect(page.getByLabel("Identifier 1 value")).toHaveValue("045496590420");
});

test("a scanned barcode opens Add item with the identifier filled in", async ({ page }) => {
  await page.goto("/scan");
  await page.getByLabel("Barcode number").fill("978-0-441-01359-3");
  await page.getByRole("button", { name: "Continue to Add item" }).click();
  await expect(page.getByLabel("Identifier 1 type")).toHaveValue("isbn13");
  await expect(page.getByLabel("Identifier 1 value")).toHaveValue("9780441013593");
  // The seeded "Dune, hardcover" has this ISBN, so the form offers to add stock to it.
  await expect(page.getByRole("link", { name: /Add stock to this item/ }).or(page.getByRole("button", { name: /Add stock to this item/ }))).toBeVisible();
});

test("item detail links to price lookup and the listing form links to fee rules", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByRole("table", { name: "Inventory" }).getByRole("row").nth(1).getByRole("link").first().click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("link", { name: "Price lookup" }).filter({ visible: true }).last()).toHaveAttribute("href", /^\/lookup\?q=.+/);
  await page.goto("/listings/new");
  await expect(page.getByRole("link", { name: "Edit fee rules" })).toHaveAttribute("href", "/settings/marketplaces");
});

test("quick actions are on every page", async ({ page }) => {
  for (const path of ["/", "/inventory", "/listings", "/sales", "/lookup", "/settings/marketplaces", "/sales/new", "/inventory/new"]) {
    await page.goto(path);
    const button = page.getByRole("button", { name: "Quick actions" });
    await button.click();
    const menu = page.getByRole("navigation", { name: "Quick actions" });
    for (const [name, href] of [
      ["Add item", "/inventory/new"],
      ["Scan barcode", "/scan"],
      ["New listing", "/listings/new"],
      ["Mark sold", "/sales/new"],
      ["Price lookup", "/lookup"],
    ] as const) {
      await expect(menu.getByRole("link", { name }), `${path} ${name}`).toHaveAttribute("href", href);
    }
  }
});

test("the main tables page forward", async ({ page }) => {
  for (const path of ["/inventory", "/listings", "/sales"]) {
    await page.goto(path);
    const range = page.locator("main").getByText(/^Showing [\d,]+ to [\d,]+ of [\d,]+ \w+$/).filter({ visible: true });
    await expect(range, path).toHaveText(/^Showing 1 to ([6-9]|\d{2,}) of/);
    await page.locator("main").getByRole("button", { name: "Next" }).click();
    await expect(range, path).not.toHaveText(/^Showing 1 to/);
  }
});

test("the lookup API answers without calling out when it has nothing to call", async ({ page }) => {
  const notConfigured = await page.request.get("/api/lookup?q=dune&source=ebay");
  expect(notConfigured.status()).toBe(200);
  const body = (await notConfigured.json()) as { query: string; sources: { source: string; status: string }[] };
  expect(body.query).toBe("dune");
  expect(body.sources).toEqual([expect.objectContaining({ source: "ebay", status: "not_configured" })]);

  expect((await page.request.get("/api/lookup?q=")).status()).toBe(400);
  expect((await page.request.get("/api/lookup?q=dune&source=nope")).status()).toBe(400);
});
