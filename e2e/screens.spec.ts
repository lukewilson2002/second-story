import { expect, test, type Locator, type Page } from "@playwright/test";
import { findLowContrast, findSmallControls } from "./helpers";

// Behaviour of the designed screens that the feature specs do not reach: the inventory table's own sorting and
// sideways scroll, the dashboard's charts with demo data, and the quick-actions menu driven from the keyboard.

async function columnTexts(table: Locator, columnIndex: number): Promise<string[]> {
  return table.locator(`tbody tr td:nth-child(${columnIndex})`).allTextContents();
}

async function sortBy(page: Page, table: Locator, header: string, direction: "ascending" | "descending"): Promise<void> {
  const column = table.getByRole("columnheader", { name: header });
  for (let clicks = 0; clicks < 3; clicks += 1) {
    if ((await column.getAttribute("aria-sort")) === direction) return;
    await column.getByRole("button").click();
  }
  await expect(column).toHaveAttribute("aria-sort", direction);
}

test("the inventory table sorts by a column and filters by category and status", async ({ page }) => {
  await page.goto("/inventory");
  const table = page.getByRole("table", { name: "Inventory" });
  const headers = await table.getByRole("columnheader").allTextContents();
  const quantityColumn = headers.findIndex((text) => text.trim().startsWith("Qty")) + 1;
  const categoryColumn = headers.findIndex((text) => text.trim().startsWith("Category")) + 1;
  const statusColumn = headers.findIndex((text) => text.trim().startsWith("Status")) + 1;
  expect(quantityColumn).toBeGreaterThan(0);

  await sortBy(page, table, "Qty", "descending");
  const descending = (await columnTexts(table, quantityColumn)).map((text) => Number(text.replaceAll(",", "")));
  expect(descending.length).toBeGreaterThan(2);
  expect(descending).toEqual([...descending].sort((a, b) => b - a));
  await sortBy(page, table, "Qty", "ascending");
  const ascending = (await columnTexts(table, quantityColumn)).map((text) => Number(text.replaceAll(",", "")));
  expect(ascending).toEqual([...ascending].sort((a, b) => a - b));
  expect(ascending[0]).toBeLessThan(descending[0] ?? 0);

  // Movie is a parent category, so its DVDs, Blu-rays and tapes are included.
  await page.getByRole("main").getByRole("combobox", { name: /^Category/ }).selectOption({ label: "Movie" });
  await expect(page).toHaveURL(/category=/);
  const categories = await columnTexts(table, categoryColumn);
  expect(categories.length).toBeGreaterThan(0);
  for (const category of categories) expect(category).toMatch(/^Movie/);

  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "In stock" }).click();
  await expect(page).toHaveURL(/status=in_stock/);
  for (const status of await columnTexts(table, statusColumn)) expect(status.trim()).toBe("In stock");

  await page.getByRole("searchbox", { name: "Search inventory" }).fill("no item has this title 91827");
  await expect(table.locator("tbody tr td:nth-child(2)")).toHaveCount(0);
});

test("on a phone the inventory table scrolls sideways inside its card, not the page", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/inventory");
  const region = page.getByRole("region", { name: "Inventory table" });
  await expect(region).toBeVisible();
  const before = await region.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
  expect(before.scrollWidth).toBeGreaterThan(before.clientWidth);
  await region.evaluate((element) => element.scrollTo({ left: 300 }));
  expect(await region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => window.scrollX)).toBe(0);
});

test("the dashboard draws its charts from the demo data", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Recharts draws one rectangle per bar that has a value. Two charts are on the page: profit and revenue, then spend and revenue.
  const charts = page.locator("main svg.recharts-surface");
  await expect(charts).toHaveCount(2);
  for (const chart of [charts.nth(0), charts.nth(1)]) {
    await expect(chart.locator("path.recharts-rectangle").first()).toBeVisible();
    const heights = await chart.locator("path.recharts-rectangle").evaluateAll((bars) => bars.map((bar) => bar.getBoundingClientRect().height));
    expect(heights.filter((height) => height > 4).length).toBeGreaterThanOrEqual(3);
    const box = await chart.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(250);
  }
  await expect(charts.nth(0).locator("path.recharts-line-curve")).toHaveCount(1);
  expect(await page.getByRole("table", { name: "Profit and revenue by month" }).locator("tbody tr").count()).toBe(6);

  for (const heading of ["Profit by marketplace", "Profit by category", "Inventory age"]) {
    const card = page.getByRole("heading", { name: heading }).locator("..");
    await expect(card.getByText(/\$[\d,]+/).first()).toBeVisible();
  }
});

test("the month switcher stops at the current month and at the first month with data", async ({ page }) => {
  await page.goto("/");
  const shown = page.getByRole("group", { name: "Month shown" }).filter({ visible: true });
  const next = shown.getByRole("link", { name: "Next month" });
  await expect(next).toHaveAttribute("aria-disabled", "true");
  await expect(next).not.toHaveAttribute("href");
  await expect(page.getByRole("link", { name: "Back to this month" })).toHaveCount(0);
  const stockTile = (await page.getByText("In stock", { exact: true }).locator("..").textContent()) ?? "";

  await shown.getByRole("link", { name: "Previous month" }).click();
  await expect(page).toHaveURL(/\?month=\d{4}-\d{2}$/);
  await expect(page.getByText("Full month").filter({ visible: true })).toBeVisible();
  // In stock and Active listings always show today's figures.
  expect(await page.getByText("In stock", { exact: true }).locator("..").textContent()).toBe(stockTile);
  await expect(shown.getByRole("link", { name: "Next month" })).not.toHaveAttribute("aria-disabled", "true");

  await shown.getByRole("link", { name: "Next month" }).click();
  await expect(page.getByText("Month to date").filter({ visible: true })).toBeVisible();

  // Walking back ends at the month of the first purchase or sale.
  for (let steps = 0; steps < 36; steps += 1) {
    const previous = shown.getByRole("link", { name: "Previous month" });
    if ((await previous.getAttribute("aria-disabled")) === "true") break;
    const url = page.url();
    await previous.click();
    await expect(page).not.toHaveURL(url);
  }
  await expect(shown.getByRole("link", { name: "Previous month" })).toHaveAttribute("aria-disabled", "true");
  await page.getByRole("link", { name: "Back to this month" }).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("quick actions work from the keyboard alone on several pages", async ({ page }) => {
  for (const path of ["/", "/inventory", "/listings", "/sales", "/lookup", "/settings/categories"]) {
    await page.goto(path);
    const button = page.getByRole("button", { name: "Quick actions" });
    const menu = page.getByRole("navigation", { name: "Quick actions" });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(menu.getByRole("link", { name: "Add item", exact: true }), path).toBeFocused();
    // The menu is drawn upwards from the button, so Up moves away from it.
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("link", { name: "Scan barcode" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("link", { name: "Price lookup" })).toBeFocused();
    await page.keyboard.press("ArrowUp");
    await expect(menu.getByRole("link", { name: "Price lookup" })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("link", { name: "Mark sold" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();
  }

  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: "New listing" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/listings\/new$/);
  await expect(page.getByRole("navigation", { name: "Quick actions" })).toBeHidden();
});

test("open dialogs keep 44px controls and readable text", async ({ page }) => {
  await page.goto("/inventory");
  await page.getByRole("button", { name: /^Add stock to / }).first().click();
  await expect(page.getByRole("dialog", { name: "Add stock" })).toBeVisible();
  expect(await page.getByRole("dialog", { name: "Add stock" }).evaluate((dialog) => Boolean(dialog.closest("main")))).toBe(true);
  expect(await findSmallControls(page)).toEqual([]);
  expect(await findLowContrast(page)).toEqual([]);

  await page.goto("/listings/new");
  await page.getByRole("button", { name: "Add from inventory" }).click();
  await expect(page.getByRole("dialog", { name: "Add from inventory" })).toBeVisible();
  expect(await findSmallControls(page)).toEqual([]);
  expect(await findLowContrast(page)).toEqual([]);

  await page.goto("/settings/categories");
  await page.getByRole("button", { name: /^Edit / }).first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(await findSmallControls(page)).toEqual([]);
  expect(await findLowContrast(page)).toEqual([]);
});
