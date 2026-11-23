import { expect, test, type Page } from "@playwright/test";
import { collectPageErrors } from "../helpers";

function unique(label: string, project: string): string {
  return `${label} ${project} ${Date.now() % 100000}`;
}

/** Fills the new listing form with the first in-stock item, a title, a price and the given marketplaces. */
async function fillListing(page: Page, title: string, marketplaces: readonly string[]): Promise<void> {
  await page.goto("/listings/new");
  await page.getByRole("button", { name: "Add from inventory" }).click();
  const picker = page.getByRole("dialog", { name: "Add from inventory" });
  await picker.locator("li button").first().click();
  await picker.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByLabel("Asking price", { exact: true }).fill("30.00");
  const group = page.getByRole("group", { name: "Marketplaces" });
  for (const name of marketplaces) await group.getByRole("button", { name, exact: true }).click();
}

async function openListing(page: Page, tabPath: string, title: string): Promise<void> {
  await page.goto(tabPath);
  await page.getByLabel("Search listings by title or marketplace").fill(title);
  await page.getByRole("link", { name: title }).click();
  await expect(page).toHaveURL(/\/listings\/[0-9a-f-]{36}$/);
}

test("a listing on two marketplaces: take one down, sell on the other, pay the commission", async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  const title = unique("E2E two places", testInfo.project.name);
  await fillListing(page, title, ["eBay", "Mercari"]);
  const summary = page.getByRole("complementary", { name: "Profit summary" });
  await expect(summary.getByText("eBay", { exact: true }).first()).toBeVisible();
  await expect(summary.getByText("Mercari", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/listings$/);

  // With two marketplaces the mark-sold form asks which one it sold on.
  await openListing(page, "/listings", title);
  await page.getByRole("main").getByRole("link", { name: "Mark sold" }).click();
  await expect(page.getByRole("group", { name: /marketplace/i }).or(page.getByLabel(/marketplace/i)).first()).toBeVisible();

  await openListing(page, "/listings", title);
  await page.getByRole("button", { name: "Take down from Mercari" }).click();
  const takeDown = page.getByRole("dialog", { name: "Take down from Mercari?" });
  await takeDown.getByRole("button", { name: "Take down" }).click();
  await expect(takeDown).toBeHidden();
  await expect(page.getByRole("button", { name: "Take down from Mercari" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Take down from eBay" })).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Mark sold" }).click();
  await page.getByLabel("Sale price", { exact: true }).fill("30.00");
  await page.getByRole("button", { name: "Mark sold" }).click();
  await expect(page).toHaveURL(/\/sales$/);

  await page.getByLabel("Search sales by listing or marketplace").fill(title);
  const paid = page.getByRole("button", { name: `Mark commission on ${title} as paid` });
  await paid.click();
  const undo = page.getByRole("button", { name: `Mark commission on ${title} as not paid` });
  await expect(undo).toBeVisible();
  await undo.click();
  await expect(paid).toBeVisible();
  // Left paid, so the dashboard's commission-owed figure is the seeded one for the other specs.
  await paid.click();
  await expect(undo).toBeVisible();

  await openListing(page, "/listings?tab=sold", title);
  await expect(page.getByRole("button", { name: /Take down/ })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a listing can be ended and relisted, and a draft can be deleted", async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  const title = unique("E2E end relist", testInfo.project.name);
  await fillListing(page, title, ["Vinted"]);
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page).toHaveURL(/\/listings$/);

  await openListing(page, "/listings", title);
  await page.getByRole("button", { name: "End listing" }).click();
  const end = page.getByRole("dialog", { name: "End this listing?" });
  await end.getByRole("button", { name: "End listing" }).click();
  await expect(end).toBeHidden();

  await openListing(page, "/listings?tab=ended", title);
  // An ended listing is up nowhere, so relisting asks where it goes back up.
  await page.getByRole("button", { name: "Relist" }).click();
  await expect(page.getByText("Pick at least one marketplace.")).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(title);
  await page.getByRole("group", { name: "Marketplaces" }).getByRole("button", { name: "Vinted", exact: true }).click();
  await page.getByRole("button", { name: "Relist" }).click();
  await expect(page).toHaveURL(/\/listings$/);
  await page.getByLabel("Search listings by title or marketplace").fill(title);
  await expect(page.getByRole("link", { name: title })).toBeVisible();

  // End it again so its item is free for other specs.
  await openListing(page, "/listings", title);
  await page.getByRole("button", { name: "End listing" }).click();
  await end.getByRole("button", { name: "End listing" }).click();
  await expect(end).toBeHidden();

  const draft = unique("E2E draft", testInfo.project.name);
  await fillListing(page, draft, []);
  await page.getByRole("button", { name: "Save as draft" }).click();
  await expect(page).toHaveURL(/\/listings\?tab=draft$/);
  await openListing(page, "/listings?tab=draft", draft);
  await page.getByRole("button", { name: "Delete draft" }).click();
  const remove = page.getByRole("dialog", { name: "Delete this draft?" });
  await remove.getByRole("button", { name: "Delete draft" }).click();
  await expect(page).toHaveURL(/\/listings\?tab=draft$/);
  await expect(page.getByRole("link", { name: draft })).toHaveCount(0);
  expect(errors).toEqual([]);
});
