import { expect, test, type Page } from "@playwright/test";

// Both projects (desktop and phone) share one database, so every test names what it creates after the project and the time.
function unique(label: string, project: string): string {
  return `${label} ${project} ${Date.now()}`;
}

async function addItem(page: Page, title: string, options: { quantity?: string; cost?: string; identifier?: string } = {}) {
  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Book" });
  if (options.identifier) await page.getByLabel("Identifier 1 value").fill(options.identifier);
  await page.getByLabel("Quantity").fill(options.quantity ?? "2");
  await page.getByLabel("Unit cost").fill(options.cost ?? "3.50");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
}

test("the inventory table lists items and filters by search and status", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { level: 1, name: "Inventory" })).toBeVisible();
  await expect(page.getByText(/\d+ items?, [\d,]+ units? in stock, \$[\d,]+ cost/)).toBeVisible();
  const table = page.getByRole("table", { name: "Inventory" });
  await expect(table.getByRole("columnheader", { name: "Avg unit cost" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Search inventory" }).fill("Ocarina");
  await expect(table.getByRole("link", { name: "The Legend of Zelda: Ocarina of Time" })).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(2);

  // The demo seed gives Dune an ISBN-13. Hyphens in what is typed do not matter.
  await page.getByRole("searchbox", { name: "Search inventory" }).fill("978-0-441-01359-3");
  await expect(table.getByRole("link", { name: "Dune, hardcover" })).toBeVisible();

  await page.goto("/inventory?status=sold_out");
  await expect(page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Sold out" })).toHaveAttribute("aria-pressed", "true");
});

test("add an item, add stock to it and correct its quantity", async ({ page }, testInfo) => {
  const title = unique("E2E paperback", testInfo.project.name);
  await addItem(page, title, { quantity: "2", cost: "3.50", identifier: "978-1-4028-9462-6" });
  await expect(page.getByText("9781402894626")).toBeVisible();

  await page.getByRole("button", { name: "Add stock" }).click();
  const dialog = page.getByRole("dialog", { name: "Add stock" });
  await dialog.getByLabel("Quantity").fill("3");
  await dialog.getByLabel("Unit cost").fill("1.00");
  await dialog.getByRole("button", { name: "Add stock" }).click();
  await expect(dialog).toBeHidden();
  // (2 × $3.50 + 3 × $1.00) ÷ 5 = $2.00
  await expect(page.getByRole("table", { name: "Purchase history" }).getByRole("row")).toHaveCount(3);
  await expect(page.getByLabel("Quantity on hand")).toHaveValue("5");
  await expect(page.getByText("$2.00").first()).toBeVisible();

  await page.getByLabel("Quantity on hand").fill("4");
  await page.getByRole("button", { name: "Correct quantity" }).click();
  await expect(page.getByText("Updated")).toBeVisible();
  await expect(page.getByRole("table", { name: "Purchase history" }).getByRole("row")).toHaveCount(3);
});

test("a matching title offers to add stock to the existing item", async ({ page }, testInfo) => {
  const title = unique("E2E duplicate", testInfo.project.name);
  await addItem(page, title, { quantity: "1", cost: "2.00" });
  const itemUrl = page.url();

  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(title.toUpperCase());
  await page.getByLabel("Quantity").fill("4");
  await page.getByLabel("Unit cost").fill("2.00");
  const panel = page.getByRole("region", { name: "Possible duplicates" });
  await expect(panel.getByRole("link", { name: title })).toBeVisible();
  await panel.getByRole("button", { name: "Add stock to this item" }).click();
  await expect(page).toHaveURL(itemUrl);
  await expect(page.getByLabel("Quantity on hand")).toHaveValue("5");
});

test("save and add another keeps the category and clears the title", async ({ page }, testInfo) => {
  const title = unique("E2E another", testInfo.project.name);
  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(title);
  await page.getByLabel("Category").selectOption({ label: "Book" });
  await page.getByLabel("Unit cost").fill("1");
  await page.getByRole("button", { name: "Save and add another" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" }).getByRole("link", { name: title })).toBeVisible();
  await expect(page.getByLabel("Title")).toHaveValue("");
  await expect(page.getByLabel("Category")).not.toHaveValue("");
  await expect(page).toHaveURL(/\/inventory\/new$/);
});

test("the add item form takes its prefill from the query string", async ({ page }) => {
  await page.goto("/inventory/new?title=Prefilled%20title&identifier=0%2085391%2073732%202");
  await expect(page.getByLabel("Title")).toHaveValue("Prefilled title");
  await expect(page.getByLabel("Identifier 1 type")).toHaveValue("upc");
  await expect(page.getByLabel("Identifier 1 value")).toHaveValue("085391737322");
});

test("a lot is split evenly with the leftover cents on the first item", async ({ page }, testInfo) => {
  const prefix = unique("E2E lot", testInfo.project.name);
  await page.goto("/inventory/new?mode=lot");
  await page.getByLabel("Total paid").fill("10.00");
  await page.getByLabel("Item 1 title").fill(`${prefix} A`);
  await page.getByLabel("Item 1 category").selectOption({ label: "Book" });
  await page.getByLabel("Item 2 title").fill(`${prefix} B`);
  await page.getByLabel("Item 2 category").selectOption({ label: "Book" });
  await page.getByRole("button", { name: "Add another item" }).click();
  await page.getByLabel("Item 3 title").fill(`${prefix} C`);
  await expect(page.getByLabel("Item 3 category")).not.toHaveValue("");
  await expect(page.getByText("$3.34")).toBeVisible();
  await page.getByRole("button", { name: "Save 3 items" }).click();
  await expect(page).toHaveURL(/\/inventory$/);

  await page.getByRole("searchbox", { name: "Search inventory" }).fill(prefix);
  const table = page.getByRole("table", { name: "Inventory" });
  await expect(table.getByRole("row")).toHaveCount(4);
  await expect(table.getByRole("row", { name: new RegExp(`${prefix} A`) })).toContainText("$3.34");
  await expect(table.getByRole("row", { name: new RegExp(`${prefix} B`) })).toContainText("$3.33");
});

test("bulk actions: change category and start a listing from the selection", async ({ page }, testInfo) => {
  const title = unique("E2E bulk", testInfo.project.name);
  await addItem(page, title);
  await page.goto(`/inventory?q=${encodeURIComponent(title)}`);
  await page.getByLabel(`Select ${title}`).check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create listing" })).toHaveAttribute("href", /\/listings\/new\?items=[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Change category" }).click();
  const dialog = page.getByRole("dialog", { name: "Change category" });
  await dialog.getByLabel("New category").selectOption({ label: "Clothing" });
  await dialog.getByRole("button", { name: "Change category" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("table", { name: "Inventory" }).getByRole("row", { name: new RegExp(title) })).toContainText("Clothing");
});

test("photos show a not-set-up state when Cloudinary is not configured", async ({ page, request }) => {
  // The Playwright server blanks the Cloudinary variables.
  await page.goto("/inventory/new");
  await expect(page.getByText("Photo uploads are not set up")).toBeVisible();
  const response = await request.post("/api/cloudinary/sign");
  expect(response.status()).toBe(503);
  expect(await response.json()).toMatchObject({ code: "not_configured" });
});

test("import a CSV by mapping its columns", async ({ page }, testInfo) => {
  const prefix = unique("E2E import", testInfo.project.name);
  const csv = [
    "Thing,Kind,How many,Paid each,Bought on,Shop",
    `${prefix} one,Book,2,1.50,11/02/2026,Library sale`,
    `${prefix} two,Movie > DVD,1,$0.75,2026-11-03,Goodwill`,
    `${prefix} bad,Book,none,1,,`,
  ].join("\n");
  await page.goto("/inventory/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await expect(page.getByText("stock.csv")).toBeVisible();

  // None of these headers are ones the guesser knows, so every column is mapped by hand.
  await page.getByLabel('Import "Thing" as').selectOption("title");
  await page.getByLabel('Import "Kind" as').selectOption("category");
  await page.getByLabel('Import "How many" as').selectOption("quantity");
  await page.getByLabel('Import "Paid each" as').selectOption("unitCost");
  await page.getByLabel('Import "Bought on" as').selectOption("purchasedAt");
  await page.getByLabel('Import "Shop" as').selectOption("source");

  await expect(page.getByText("2 rows are ready to import.")).toBeVisible();
  await expect(page.getByText("1 row has a problem and will be skipped.")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 rows" }).click();
  await expect(page.getByText("Import finished. 2 items created.")).toBeVisible();

  await page.getByRole("link", { name: "Go to inventory" }).click();
  await page.getByRole("searchbox", { name: "Search inventory" }).fill(prefix);
  const table = page.getByRole("table", { name: "Inventory" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row", { name: new RegExp(`${prefix} two`) })).toContainText("Movie › DVD");
});
