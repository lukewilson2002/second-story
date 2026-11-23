import { expect, test } from "@playwright/test";

test.describe("dashboard", () => {
  test("opens on the current month with today's figures and the lists", async ({ page, isMobile }) => {
    await page.goto("/");
    await expect(page.getByText("Month to date").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("In stock", { exact: true })).toBeVisible();
    await expect(page.getByText("Active listings", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Recent sales" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Profit by marketplace" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Inventory age" })).toBeVisible();
    if (isMobile) await expect(page.getByText("Profit this month")).toBeVisible();
    else await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next month" })).toHaveAttribute("aria-disabled", "true");
  });

  test("switches to an earlier month and back", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Previous month" }).click();
    await expect(page).toHaveURL(/\/\?month=\d{4}-\d{2}$/);
    await expect(page.getByText("Full month").filter({ visible: true })).toBeVisible();
    await page.getByRole("link", { name: "Back to this month" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByText("Month to date").filter({ visible: true })).toBeVisible();
  });

  test("ignores a month in the future", async ({ page }) => {
    await page.goto("/?month=2999-01");
    await expect(page.getByText("Month to date").filter({ visible: true })).toBeVisible();
  });

  test("toggles the profit chart between months and weeks", async ({ page }) => {
    await page.goto("/");
    const week = page.getByRole("button", { name: "Week", exact: true });
    await week.click();
    await expect(week).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("table", { name: "Profit and revenue by week" })).toBeAttached();
  });

  test("needs-attention rows link into filtered views", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /below (their )?minimum/i })).toHaveAttribute("href", "/listings?filter=below-minimum");
    await expect(page.getByRole("link", { name: /60 days/ })).toHaveAttribute("href", "/listings?filter=stale");
    await expect(page.getByRole("link", { name: /still up/ })).toHaveAttribute("href", "/listings?filter=still-up");
    await expect(page.getByRole("link", { name: /Commission owed/ })).toHaveAttribute("href", "/sales?filter=commission-owed");
    await page.getByRole("link", { name: /not listed/ }).click();
    await expect(page).toHaveURL(/\/inventory\?status=in_stock$/);
  });
});

test.describe("quick actions", () => {
  test("opens a menu of five links and closes on Escape and on an outside click", async ({ page }) => {
    await page.goto("/settings");
    const button = page.getByRole("button", { name: "Quick actions" });
    const menu = page.getByRole("navigation", { name: "Quick actions" });
    await expect(menu).toBeHidden();

    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    for (const name of ["Add item", "Scan barcode", "New listing", "Mark sold", "Price lookup"]) {
      await expect(menu.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(menu.getByRole("link", { name: "Add item", exact: true })).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(button).toBeFocused();

    await button.click();
    await expect(menu).toBeVisible();
    await page.locator("main#main").click({ position: { x: 5, y: 5 } });
    await expect(menu).toBeHidden();
  });

  test("goes to the chosen action", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Quick actions" }).click();
    await page.getByRole("navigation", { name: "Quick actions" }).getByRole("link", { name: "Scan barcode" }).click();
    await expect(page).toHaveURL(/\/scan$/);
    await expect(page.getByRole("navigation", { name: "Quick actions" })).toBeHidden();
  });
});

test.describe("scan", () => {
  test("typing a barcode opens Add item with the identifier and its type", async ({ page }) => {
    await page.goto("/scan");
    await page.getByLabel("Barcode number").fill("978-0-441-01359-3");
    await expect(page.getByText("Looks like ISBN-13.")).toBeVisible();
    await page.getByRole("button", { name: "Continue to Add item" }).click();
    await expect(page).toHaveURL(/\/inventory\/new\?identifier=9780441013593&identifierType=isbn13$/);
  });

  test("asks for a number when the field is empty", async ({ page }) => {
    await page.goto("/scan");
    await page.getByRole("button", { name: "Continue to Add item" }).click();
    await expect(page.getByText("Enter the number under the barcode.")).toBeVisible();
    await expect(page).toHaveURL(/\/scan$/);
  });
});
