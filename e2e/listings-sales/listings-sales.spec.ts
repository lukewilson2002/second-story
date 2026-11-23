import { expect, test } from "@playwright/test";

// NOT YET RUN. The listings-sales agent was not allowed to start a server or Playwright, so these were written blind.
// Expect to adjust selectors on the first run.

test("listings table has its tabs and honours the dashboard filters", async ({ page }) => {
  await page.goto("/listings");
  await expect(page.getByRole("heading", { level: 1, name: "Listings" })).toBeVisible();
  const tabs = page.getByRole("navigation", { name: "Listing status" });
  await expect(tabs.getByRole("link", { name: /Active/ })).toHaveAttribute("aria-current", "page");
  await tabs.getByRole("link", { name: /Sold/ }).click();
  await expect(page).toHaveURL(/tab=sold/);
  await expect(tabs.getByRole("link", { name: /Sold/ })).toHaveAttribute("aria-current", "page");

  await page.goto("/listings?filter=below-minimum");
  await expect(page.getByText("Showing: Priced below minimum")).toBeVisible();
  await page.goto("/listings?filter=still-up");
  await expect(page.getByText("Showing: Sold, still up elsewhere")).toBeVisible();
});

test("publish a listing, mark it sold, and find it in the sales export", async ({ page }) => {
  const title = `E2E listing ${Date.now()}`;

  await page.goto("/listings/new");
  await expect(page.getByRole("heading", { level: 1, name: "New listing" })).toBeVisible();
  await page.getByRole("button", { name: "Add from inventory" }).click();
  const picker = page.getByRole("dialog", { name: "Add from inventory" });
  await picker.locator("li button").first().click();
  await picker.getByRole("button", { name: "Done" }).click();

  await page.getByLabel("Title", { exact: true }).fill(title);
  // Publishing with no marketplace is refused.
  await page.getByLabel("Asking price", { exact: true }).fill("44.99");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByText("Pick at least one marketplace.")).toBeVisible();

  const marketplaces = page.getByRole("group", { name: "Marketplaces" });
  await marketplaces.getByRole("button", { name: "eBay", exact: true }).click();
  await expect(marketplaces.getByRole("button", { name: "eBay", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("eBay link")).toBeVisible();
  const summary = page.getByRole("complementary", { name: "Profit summary" });
  await expect(summary.getByText("Minimum price to break even")).toBeVisible();
  await expect(summary.getByText(/Asking price: [+−]\$/)).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByLabel("Search listings by title or marketplace").fill(title);
  await page.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Edit listing" })).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Mark sold" }).click();
  await expect(page).toHaveURL(/\/sales\/new\?listing=/);
  await expect(page.getByText(title)).toBeVisible();
  await page.getByLabel("Sale price", { exact: true }).fill("40.00");
  await page.getByLabel("Shipping cost", { exact: true }).fill("5.60");
  await page.getByRole("button", { name: "Mark sold" }).click();

  await expect(page).toHaveURL(/\/sales$/);
  await page.getByLabel("Search sales by listing or marketplace").fill(title);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  const response = await page.request.get("/sales/export");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/csv");
  const csv = await response.text();
  expect(csv).toContain("Sold date,Listing,Marketplace");
  expect(csv).toContain(title);
});

test("the sales export needs a signed-in user", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const response = await context.request.get("/sales/export", { maxRedirects: 0 });
  expect([401, 302, 307]).toContain(response.status());
  await context.close();
});
