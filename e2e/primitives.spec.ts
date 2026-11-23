import { expect, test } from "@playwright/test";

test("every interactive control on the primitives page is at least 44px tall", async ({ page }) => {
  await page.goto("/dev/ui");
  await expect(page.getByRole("heading", { level: 1, name: "UI primitives" })).toBeVisible();
  const tooSmall = await page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      "main a, main button, main input:not([type=hidden]):not([type=checkbox]), main select, main textarea",
    );
    return [...controls]
      .filter((element) => element.getClientRects().length > 0)
      .map((element) => ({ text: (element.textContent || element.getAttribute("name") || element.tagName).trim().slice(0, 40), height: element.getBoundingClientRect().height }))
      .filter((control) => control.height < 43.5);
  });
  expect(tooSmall).toEqual([]);
});

test("form primitives turn typed text into cents and basis points", async ({ page }) => {
  await page.goto("/dev/ui");
  const price = page.getByLabel("Asking price");
  await expect(price).toHaveValue("44.99");
  await price.fill("12.5");
  await expect(page.getByText("Value in cents: 1250 ($12.50)")).toBeVisible();
  await price.blur();
  await expect(price).toHaveValue("12.50");
  await price.fill("abc");
  await expect(page.getByText("Value in cents: none")).toBeVisible();
  await expect(price).toHaveAttribute("aria-invalid", "true");

  const share = page.getByLabel("Share of profit");
  await share.fill("12.5");
  await expect(page.getByText("Value in basis points: 1250 (12.5%)")).toBeVisible();

  const condition = page.getByLabel("Condition");
  await expect(condition).toHaveAttribute("aria-invalid", "true");
  await expect(condition).toHaveAccessibleDescription("Pick a condition");

  const category = page.getByLabel("Category");
  // Other tests may add categories, so only the seeded ones are checked. Children are indented under their parent.
  await expect(category.getByRole("option", { name: "Choose a category" })).toBeAttached();
  await expect(category.getByRole("option", { name: "Book", exact: true })).toBeAttached();
  const options = await category.getByRole("option").allTextContents();
  expect(options.indexOf("Movie")).toBeGreaterThan(-1);
  expect(options.find((option) => option.trim() === "DVD")).toMatch(/^\s+DVD$/);
});

test("stepper, segmented control and dialog work", async ({ page }) => {
  await page.goto("/dev/ui");
  const stepper = page.getByRole("group", { name: "Quantity of example item" });
  await expect(stepper.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  for (let i = 0; i < 6; i += 1) {
    const increase = stepper.getByRole("button", { name: "Increase quantity" });
    if (await increase.isEnabled()) await increase.click();
  }
  await expect(page.getByTestId("stepper-value")).toHaveText("Quantity: 5");

  const status = page.getByRole("group", { name: "Status" });
  await status.getByRole("button", { name: "Listed" }).click();
  await expect(status.getByRole("button", { name: "Listed" })).toHaveAttribute("aria-pressed", "true");
  await expect(status.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: "Open dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Add stock" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Open sheet" }).click();
  await expect(page.getByRole("dialog", { name: "Add from inventory" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("dialog", { name: "Add from inventory" })).toBeHidden();
});

test("the table fills the window height, sorts, pages and selects", async ({ page }) => {
  await page.goto("/dev/table");
  const table = page.getByRole("table", { name: "Demo items" });
  const bodyRows = table.locator("tbody tr");
  await expect(bodyRows.first()).toBeVisible();

  const fits = async () =>
    page.evaluate(() => ({
      rows: document.querySelectorAll("tbody tr").length,
      pageScrolls: document.documentElement.scrollHeight > window.innerHeight + 1,
    }));
  const tall = await fits();
  expect(tall.rows).toBeGreaterThanOrEqual(3);
  expect(tall.pageScrolls).toBe(false);
  await expect(page.getByText(`Showing 1 to ${tall.rows} of 60 items`)).toBeVisible();

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 190 });
  await expect.poll(async () => (await fits()).rows).toBeLessThan(tall.rows);
  // A very short window still shows the minimum of three rows, and then the page has to scroll.
  const short = await fits();
  if (short.rows > 3) expect(short.pageScrolls).toBe(false);
  await page.setViewportSize(viewport);
  await expect.poll(async () => (await fits()).rows).toBe(tall.rows);

  await table.getByRole("button", { name: "Avg unit cost" }).click();
  await expect(table.getByRole("columnheader", { name: "Avg unit cost" })).toHaveAttribute("aria-sort", "ascending");
  await expect(bodyRows.first()).toContainText("$0.75");
  await table.getByRole("button", { name: "Avg unit cost" }).click();
  await expect(table.getByRole("columnheader", { name: "Avg unit cost" })).toHaveAttribute("aria-sort", "descending");
  await expect(bodyRows.first()).toContainText("$14.73");

  await table.getByRole("button", { name: "Days held" }).click();
  await table.getByRole("button", { name: "Days held" }).click();
  await expect(bodyRows.first()).not.toContainText("–");

  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText(`Showing ${tall.rows + 1} to`)).toBeVisible();
  await expect(page.getByRole("button", { name: "Previous", exact: true })).toBeEnabled();

  await table.getByRole("checkbox", { name: /^Select Demo item/ }).first().check();
  await expect(page.getByTestId("selection-count")).toHaveText("1 selected");
  await table.getByRole("checkbox", { name: "Select all items" }).check();
  await expect(page.getByTestId("selection-count")).toHaveText("60 selected");

  const numericAlign = await table.locator("tbody tr").first().locator("td").nth(3).evaluate((cell) => getComputedStyle(cell).textAlign);
  expect(numericAlign).toBe("right");
});

test("a wide table scrolls sideways inside its card on a phone", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone only");
  await page.goto("/dev/table");
  const region = page.getByRole("region", { name: "Demo items table" });
  const sizes = await region.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
