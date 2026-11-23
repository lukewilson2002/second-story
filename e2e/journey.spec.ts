import { expect, test, type Page } from "@playwright/test";
import Papa from "papaparse";
import { collectPageErrors } from "./helpers";

/**
 * One item followed from purchase to sale, with every figure worked out by hand from docs/design.md section 4.
 * The numbers are literals on purpose. Importing src/lib/calc would only compare the app with itself.
 *
 * Item: 2 units at $18.00.
 * Marketplace A: 13% on price plus shipping, $0.40 per order. Marketplace B: 10% on price only, $0.30 per order.
 * Listing: $5.00 shipping charged, $5.60 shipping cost, 20% commission.
 *
 * Minimum on A = (18.00 + 5.60 + 0.40) / 0.87 − 5.00 = 27.586 → 27.59 − 5.00 = $22.59
 * Minimum on B = (18.00 + 5.60 + 0.30 − 5.00) / 0.90 = $21.00
 * At $44.99 on A: fee 0.13 × 49.99 + 0.40 = $6.90, before commission $19.49, commission $3.90, profit $15.59
 * Sold on A for $40.00, label $6.10, extra fees $1.25:
 *   fee 0.13 × 45.00 + 0.40 = $6.25
 *   before commission 40.00 + 5.00 − 6.25 − 6.10 − 1.25 − 18.00 = $13.40
 *   commission 20% = $2.68, profit $10.72, margin 10.72 / 45.00 = 23.8%
 */

function unique(label: string, project: string): string {
  return `${label} ${project} ${Date.now() % 1000000}`;
}

async function addMarketplaceWithFees(
  page: Page,
  name: string,
  fees: { percent: string; fixed: string; onShipping: boolean },
): Promise<void> {
  await page.goto("/settings/marketplaces");
  await page.getByRole("button", { name: "Add marketplace" }).first().click();
  const add = page.getByRole("dialog", { name: "Add marketplace" });
  await add.getByLabel("Name").fill(name);
  await add.getByRole("button", { name: "Add marketplace" }).click();
  await expect(add).toBeHidden();

  await page.getByRole("button", { name: `Enter fees for ${name}` }).click();
  const rule = page.getByRole("dialog", { name: `Add fee rule for ${name}` });
  await rule.getByLabel("Marketplace fee").fill(fees.percent);
  await rule.getByLabel("Fixed fee", { exact: true }).fill(fees.fixed);
  if (!fees.onShipping) await rule.getByLabel(/Percent applies to shipping too/).uncheck();
  await rule.getByRole("button", { name: "Save rule" }).click();
  await expect(rule).toBeHidden();
}

async function stillUpCount(page: Page): Promise<number> {
  await page.goto("/");
  const link = page.locator('main a[href="/listings?filter=still-up"]').filter({ visible: true });
  await expect(link).toHaveCount(1);
  return Number(/^[\d,]+/.exec(((await link.textContent()) ?? "").trim())?.[0]?.replaceAll(",", ""));
}

test("an item is bought, listed on two marketplaces, sold on one, and every figure matches the formulas", async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = collectPageErrors(page);
  const project = testInfo.project.name;
  const itemTitle = unique("Journey item", project);
  const listingTitle = unique("Journey listing", project);
  const marketA = unique("Market A", project);
  const marketB = unique("Market B", project);

  await addMarketplaceWithFees(page, marketA, { percent: "13", fixed: "0.40", onShipping: true });
  await addMarketplaceWithFees(page, marketB, { percent: "10", fixed: "0.30", onShipping: false });
  const stillUpBefore = await stillUpCount(page);

  await page.goto("/inventory/new");
  await page.getByLabel("Title").fill(itemTitle);
  await page.getByLabel("Category").selectOption({ label: "Book" });
  await page.getByLabel("Quantity").fill("2");
  await page.getByLabel("Unit cost").fill("18.00");
  await page.getByRole("button", { name: "Save item" }).click();
  await expect(page).toHaveURL(/\/inventory\/[0-9a-f-]{36}$/);
  const itemUrl = page.url();

  await page.goto("/listings/new");
  await page.getByRole("button", { name: "Add from inventory" }).click();
  const picker = page.getByRole("dialog", { name: "Add from inventory" });
  await picker.getByLabel("Search inventory by title or identifier").fill(itemTitle);
  await picker.getByRole("button", { name: new RegExp(itemTitle) }).click();
  await picker.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Title", { exact: true }).fill(listingTitle);
  await page.getByLabel("Shipping charged").fill("5.00");
  await page.getByLabel("Shipping cost").fill("5.60");
  await page.getByLabel("Share of profit").fill("20");
  await page.getByLabel("Paid to").fill("Sam");
  const group = page.getByRole("group", { name: "Marketplaces" });
  await group.getByRole("button", { name: marketA, exact: true }).click();
  await group.getByRole("button", { name: marketB, exact: true }).click();

  const summary = page.getByRole("complementary", { name: "Profit summary" });
  const minimumCard = summary.locator("section").filter({ hasText: "Minimum price to break even" });
  const rowA = minimumCard.locator("div.flex").filter({ hasText: marketA });
  const rowB = minimumCard.locator("div.flex").filter({ hasText: marketB });
  await expect(rowA).toContainText("$22.59");
  await expect(rowB).toContainText("$21.00");

  // $22.00 is under A's minimum and over B's, so the warning names A alone.
  await page.getByLabel("Asking price", { exact: true }).fill("22.00");
  const warning = minimumCard.getByRole("status");
  await expect(warning).toContainText(`The asking price is below the minimum on ${marketA}.`);
  await expect(warning).not.toContainText(marketB);
  await expect(rowA).toContainText("Asking price: −$0.59");
  await expect(rowB).toContainText("Asking price: +$1.00");

  await page.getByLabel("Asking price", { exact: true }).fill("20.00");
  await expect(warning).toContainText(`below the minimum on ${marketA} and ${marketB}`);

  await page.getByLabel("Asking price", { exact: true }).fill("44.99");
  await expect(warning).toHaveCount(0);
  await expect(rowA).toContainText("Asking price: +$22.40");
  await summary.getByRole("group", { name: "Marketplace shown" }).getByRole("button", { name: marketA }).click();
  await expect(summary.getByText("−$6.90")).toBeVisible();
  await expect(summary.getByText("$19.49")).toBeVisible();
  await expect(summary.getByText("−$3.90")).toBeVisible();
  await expect(summary.getByText("$15.59")).toBeVisible();

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByLabel("Search listings by title or marketplace").fill(listingTitle);
  const listingRow = page.getByRole("table").getByRole("row", { name: new RegExp(listingTitle) });
  // The table shows the highest minimum across the marketplaces the listing is up on.
  await expect(listingRow).toContainText("$22.59");
  await expect(listingRow).toContainText("$44.99");

  await page.goto(itemUrl);
  await expect(page.getByText("Listed", { exact: true }).first()).toBeVisible();

  await page.goto("/listings");
  await page.getByLabel("Search listings by title or marketplace").fill(listingTitle);
  await page.getByRole("link", { name: listingTitle }).click();
  await page.getByRole("main").getByRole("link", { name: "Mark sold" }).click();
  await page.getByLabel("Sold on").selectOption({ label: marketA });
  await page.getByLabel("Sale price", { exact: true }).fill("40.00");
  await page.getByLabel("Shipping cost", { exact: true }).fill("6.10");
  await page.getByLabel("Extra fees").fill("1.25");
  const saleSummary = page.getByRole("complementary", { name: "Sale summary" });
  await expect(saleSummary.getByText("−$6.25")).toBeVisible();
  await expect(saleSummary.getByText("$13.40")).toBeVisible();
  await expect(saleSummary.getByText("−$2.68")).toBeVisible();
  await expect(saleSummary.getByText("$10.72")).toBeVisible();
  await page.getByRole("button", { name: "Mark sold" }).click();

  // The listing is sold out but still up on B, so the app goes to the listing to take it down.
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}$/);
  const listingUrl = page.url();
  await expect(page.getByRole("button", { name: `Take down from ${marketB}` })).toBeVisible();
  await expect(page.getByRole("button", { name: `Take down from ${marketA}` })).toHaveCount(0);

  await page.goto("/sales");
  await page.getByLabel("Search sales by listing or marketplace").fill(listingTitle);
  const saleRow = page.getByRole("table", { name: "Sales" }).getByRole("row", { name: new RegExp(listingTitle) });
  await expect(saleRow).toContainText(marketA);
  await expect(saleRow).toContainText("$45.00");
  await expect(saleRow).toContainText("$10.72");
  await expect(saleRow).toContainText("23.8%");
  await expect(saleRow).toContainText("$2.68");

  // The export is downloaded by clicking the real link, then parsed.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.csv$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Uint8Array));
  const parsed = Papa.parse<Record<string, string>>(Buffer.concat(chunks).toString("utf8").replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  expect(parsed.errors).toEqual([]);
  const exported = parsed.data.find((row) => row["Listing"] === listingTitle);
  expect(exported).toMatchObject({
    Marketplace: marketA,
    Quantity: "1",
    "Item price": "40.00",
    "Shipping charged": "5.00",
    Revenue: "45.00",
    "Marketplace fee": "6.25",
    "Additional fees": "1.25",
    "Shipping cost": "6.10",
    "Cost of goods": "18.00",
    "Profit before commission": "13.40",
    Commission: "2.68",
    "Commission paid to": "Sam",
    Profit: "10.72",
    "Margin %": "23.82",
  });

  await page.goto(itemUrl);
  await expect(page.getByLabel("Quantity on hand")).toHaveValue("1");

  await page.goto("/listings?tab=sold");
  await page.getByLabel("Search listings by title or marketplace").fill(listingTitle);
  await expect(page.getByRole("link", { name: listingTitle })).toBeVisible();
  await page.goto("/listings");
  await page.getByLabel("Search listings by title or marketplace").fill(listingTitle);
  await expect(page.getByRole("link", { name: listingTitle })).toHaveCount(0);

  await page.goto("/listings?filter=still-up");
  await expect(page.getByRole("link", { name: listingTitle })).toBeVisible();
  expect(await stillUpCount(page)).toBe(stillUpBefore + 1);

  // Tidy up, so the seeded dashboard figures are unchanged for the other specs.
  await page.goto(listingUrl);
  await page.getByRole("button", { name: `Take down from ${marketB}` }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Take down" }).click();
  await expect(page.getByRole("button", { name: /Take down/ })).toHaveCount(0);
  expect(await stillUpCount(page)).toBe(stillUpBefore);

  await page.goto("/sales");
  await page.getByLabel("Search sales by listing or marketplace").fill(listingTitle);
  await page.getByRole("button", { name: `Mark commission on ${listingTitle} as paid` }).click();
  await expect(page.getByRole("button", { name: `Mark commission on ${listingTitle} as not paid` })).toBeVisible();

  await page.goto("/settings/marketplaces");
  for (const name of [marketA, marketB]) {
    await page.getByRole("button", { name: `Archive ${name}`, exact: true }).click();
    await expect(page.getByRole("button", { name: `Unarchive ${name}`, exact: true })).toBeVisible();
  }
  expect(errors).toEqual([]);
});
