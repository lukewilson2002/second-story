import { expect, test, type Page } from "@playwright/test";
import { collectPageErrors, findLowContrast, findSmallControls } from "./helpers";

const STATIC_ROUTES = [
  "/",
  "/scan",
  "/inventory",
  "/inventory?status=in_stock",
  "/inventory/new",
  "/inventory/new?mode=lot",
  "/inventory/import",
  "/listings",
  "/listings?tab=sold",
  "/listings?tab=ended",
  "/listings?tab=draft",
  "/listings?filter=below-minimum",
  "/listings?filter=stale",
  "/listings?filter=still-up",
  "/listings/new",
  "/sales",
  "/sales?filter=commission-owed",
  "/sales/new",
  "/lookup",
  "/settings",
  "/settings/categories",
  "/settings/marketplaces",
  "/settings/commission",
];

async function firstDetailHref(page: Page, listPath: string, prefix: string): Promise<string | null> {
  await page.goto(listPath);
  const hrefs = await page.locator(`main a[href^="${prefix}"]`).evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""));
  return hrefs.find((href) => /^\/[a-z]+\/[0-9a-f-]{36}$/.test(href)) ?? null;
}

test("every page renders without errors, sideways scroll, undersized controls or low-contrast text", async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const errors = collectPageErrors(page);
  const routes = [...STATIC_ROUTES];
  for (const [listPath, prefix] of [
    ["/inventory", "/inventory/"],
    ["/listings", "/listings/"],
    ["/listings?tab=sold", "/listings/"],
  ] as const) {
    const href = await firstDetailHref(page, listPath, prefix);
    expect(href, `a detail link on ${listPath}`).not.toBeNull();
    if (href) routes.push(href);
  }

  const problems: string[] = [];
  for (const [index, path] of routes.entries()) {
    errors.length = 0;
    const response = await page.goto(path);
    await page.waitForLoadState("networkidle");
    if (response?.status() !== 200) problems.push(`${path}: status ${response?.status()}`);
    if (await page.getByText("Something went wrong").count()) problems.push(`${path}: error boundary`);
    for (const error of errors) problems.push(`${path}: ${error}`);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${path}: scrolls sideways by ${overflow}px`);
    for (const control of await findSmallControls(page)) problems.push(`${path}: "${control.text}" is ${control.height}px tall`);
    for (const low of await findLowContrast(page)) {
      problems.push(`${path}: "${low.text}" has ${low.ratio}:1 contrast (${low.color} on ${low.background})`);
    }
    if (process.env.SWEEP_SCREENSHOTS) {
      await page.screenshot({ path: `${process.env.SWEEP_SCREENSHOTS}/${testInfo.project.name}-${String(index).padStart(2, "0")}.png`, fullPage: true });
    }
  }
  expect(problems).toEqual([]);
});
