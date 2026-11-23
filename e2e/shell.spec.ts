import { expect, test } from "@playwright/test";

// Only what the foundation owns is checked here: the page answers, and it sits inside the shell.
// Headings and page content belong to the features and change as they are built.
const ROUTES = [
  "/",
  "/scan",
  "/inventory",
  "/inventory/new",
  "/inventory/import",
  "/listings",
  "/listings/new",
  "/sales",
  "/sales/new",
  "/lookup",
  "/settings",
  "/settings/categories",
  "/settings/marketplaces",
  "/settings/commission",
];

test("every route in the route map renders inside the shell", async ({ page, isMobile }) => {
  for (const path of ROUTES) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
    expect(new URL(page.url()).pathname, path).toBe(path);
    await expect(page.locator("main#main"), path).toBeVisible();
    await expect(page.getByRole("navigation", { name: isMobile ? "Sections" : "Main" }), path).toBeVisible();
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
    const topBar = page.getByRole("banner");
    await topBar.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await topBar.getByRole("link", { name: "Price lookup" }).click();
    await expect(page).toHaveURL(/\/lookup$/);
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
