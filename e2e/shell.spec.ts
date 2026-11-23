import { expect, test } from "@playwright/test";

const ROUTES: [path: string, heading: string][] = [
  ["/", "Dashboard"],
  ["/scan", "Scan barcode"],
  ["/inventory", "Inventory"],
  ["/inventory/new", "Add item"],
  ["/inventory/import", "Import CSV"],
  ["/listings", "Listings"],
  ["/listings/new", "New listing"],
  ["/sales", "Sales"],
  ["/sales/new", "Mark sold"],
  ["/lookup", "Price lookup"],
  ["/settings", "Settings"],
  ["/settings/categories", "Categories"],
  ["/settings/marketplaces", "Marketplaces and fee rules"],
  ["/settings/commission", "Default commission"],
];

test("every route in the route map renders inside the shell", async ({ page }) => {
  for (const [path, heading] of ROUTES) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }), path).toHaveText(heading);
    await expect(page.getByRole("link", { name: "Add item" }), path).toBeVisible();
  }
});

test("the nav reaches each section and marks the current one", async ({ page, isMobile }) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: isMobile ? "Sections" : "Main" });
  const sections = isMobile
    ? ["Inventory", "Listings", "Sales", "Home"]
    : ["Inventory", "Listings", "Sales", "Price lookup", "Settings", "Dashboard"];
  for (const name of sections) {
    await nav.getByRole("link", { name, exact: true }).click();
    await expect(nav.getByRole("link", { name, exact: true })).toHaveAttribute("aria-current", "page");
  }
  if (isMobile) {
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
    await page.getByRole("link", { name: "Price lookup" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Price lookup" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Sections" })).toBeHidden();
  }
});

test("the page does not scroll sideways", async ({ page }) => {
  for (const path of ["/", "/dev/ui", "/dev/table"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(0);
  }
});
