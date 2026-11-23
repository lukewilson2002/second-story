import { expect, test } from "@playwright/test";
import { collectPageErrors, findSmallControls } from "../helpers";

// Desktop and phone share one database, so every name carries the project name.
function unique(label: string, project: string): string {
  return `${label} ${project} ${Date.now() % 100000}`;
}

test("settings home links to each section", async ({ page }) => {
  await page.goto("/settings");
  const main = page.locator("main");
  for (const [name, path] of [
    [/Categories/, "/settings/categories"],
    [/Marketplaces/, "/settings/marketplaces"],
    [/commission/i, "/settings/commission"],
  ] as const) {
    await expect(main.getByRole("link", { name }).first()).toHaveAttribute("href", path);
  }
  await expect(main.getByRole("button", { name: "Log out" })).toBeVisible();
});

test("categories: add, nest, rename, move and archive", async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  const parent = unique("Games", testInfo.project.name);
  const child = `${parent} child`;
  await page.goto("/settings/categories");

  await page.getByRole("button", { name: "Add category" }).first().click();
  const add = page.getByRole("dialog", { name: "Add category" });
  expect(await findSmallControls(page)).toEqual([]);
  await add.getByLabel("Name").fill(parent);
  await add.getByRole("button", { name: "Add category" }).click();
  await expect(add).toBeHidden();
  await expect(page.getByRole("button", { name: `Edit ${parent}`, exact: true })).toBeVisible();

  // The same name at the same level is refused, and the typed name stays in the field.
  await page.getByRole("button", { name: "Add category" }).first().click();
  await add.getByLabel("Name").fill(parent.toUpperCase());
  await add.getByRole("button", { name: "Add category" }).click();
  await expect(add.getByText(/already/i)).toBeVisible();
  await expect(add.getByLabel("Name")).toHaveValue(parent.toUpperCase());
  await add.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: `Add a subcategory under ${parent}`, exact: true }).click();
  await add.getByLabel("Name").fill(child);
  await add.getByRole("button", { name: "Add category" }).click();
  await expect(add).toBeHidden();
  await expect(page.getByRole("button", { name: `Edit ${parent} › ${child}`, exact: true })).toBeVisible();

  await page.getByRole("button", { name: `Edit ${parent} › ${child}`, exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit category" });
  expect(await findSmallControls(page)).toEqual([]);
  await edit.getByLabel("Name").fill(`${child} renamed`);
  await edit.getByLabel("Parent category").selectOption("");
  await edit.getByRole("button", { name: "Save", exact: true }).click();
  await expect(edit).toBeHidden();
  await expect(page.getByRole("button", { name: `Edit ${child} renamed`, exact: true })).toBeVisible();

  // The new category is offered on the add item form.
  await page.goto("/inventory/new");
  await expect(page.getByLabel("Category").locator("option", { hasText: `${child} renamed` })).toHaveCount(1);

  await page.goto("/settings/categories");
  await page.getByRole("button", { name: `Edit ${child} renamed`, exact: true }).click();
  await edit.getByRole("button", { name: "Archive category" }).click();
  await expect(edit).toBeHidden();
  await page.goto("/inventory/new");
  await expect(page.getByLabel("Category").locator("option", { hasText: `${child} renamed` })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("marketplaces: add, enter fees, edit and delete a rule, rename and archive", async ({ page }, testInfo) => {
  const errors = collectPageErrors(page);
  const name = unique("Depop", testInfo.project.name);
  const renamed = `${name} renamed`;
  await page.goto("/settings/marketplaces");

  await page.getByRole("button", { name: "Add marketplace" }).first().click();
  const add = page.getByRole("dialog", { name: "Add marketplace" });
  await add.getByLabel("Name").fill("ebay");
  await add.getByRole("button", { name: "Add marketplace" }).click();
  await expect(add.getByText(/already exists/)).toBeVisible();
  await add.getByLabel("Name").fill(name);
  await add.getByRole("button", { name: "Add marketplace" }).click();
  await expect(add).toBeHidden();

  const card = page.getByRole("region", { name, exact: true }).or(page.locator(`[aria-label="${name}"]`)).first();
  await expect(card.getByText(`No fees entered for ${name} yet`)).toBeVisible();
  await card.getByRole("button", { name: `Enter fees for ${name}` }).click();
  const ruleDialog = page.getByRole("dialog", { name: `Add fee rule for ${name}` });
  expect(await findSmallControls(page)).toEqual([]);
  await expect(ruleDialog.getByLabel(/Percent applies to shipping too/)).toBeChecked();
  await ruleDialog.getByLabel("Marketplace fee").fill("10");
  await ruleDialog.getByLabel("Fixed fee", { exact: true }).fill("0.30");
  // $20.00 + $5.00 shipping at 10% + $0.30.
  await expect(ruleDialog.getByText("$2.80")).toBeVisible();
  await ruleDialog.getByRole("button", { name: "Save rule" }).click();
  await expect(ruleDialog).toBeHidden();
  await expect(card.getByText("10% + $0.30 per order")).toBeVisible();

  await card.getByRole("button", { name: `Edit the Default rule for ${name}` }).click();
  const editDialog = page.getByRole("dialog", { name: `Edit fee rule for ${name}` });
  await editDialog.getByLabel("Marketplace fee").fill("12.5");
  await editDialog.getByLabel(/Percent applies to shipping too/).uncheck();
  await editDialog.getByRole("button", { name: "Save rule" }).click();
  await expect(editDialog).toBeHidden();
  await expect(card.getByText("12.5% + $0.30 per order")).toBeVisible();

  // The new marketplace and its rule reach the listing form.
  await page.goto("/listings/new");
  await expect(page.getByRole("group", { name: "Marketplaces" }).getByRole("button", { name, exact: true })).toBeVisible();

  await page.goto("/settings/marketplaces");
  await card.getByRole("button", { name: `Edit the Default rule for ${name}` }).click();
  await editDialog.getByRole("button", { name: "Delete rule" }).click();
  await editDialog.getByRole("button", { name: "Yes, delete this rule" }).click();
  await expect(editDialog).toBeHidden();
  await expect(card.getByText(`No fees entered for ${name} yet`)).toBeVisible();

  await page.getByRole("button", { name: `Rename ${name}`, exact: true }).click();
  const rename = page.getByRole("dialog", { name: "Rename marketplace" });
  await rename.getByLabel("Name").fill(renamed);
  await rename.getByRole("button", { name: "Save", exact: true }).click();
  await expect(rename).toBeHidden();

  await page.getByRole("button", { name: `Archive ${renamed}`, exact: true }).click();
  await expect(page.getByRole("button", { name: `Unarchive ${renamed}`, exact: true })).toBeVisible();
  await page.goto("/listings/new");
  await expect(page.getByRole("group", { name: "Marketplaces" }).getByRole("button", { name: renamed, exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("commission defaults are saved and prefill a new listing", async ({ page }, testInfo) => {
  await page.goto("/settings/commission");
  const percent = page.getByLabel(/Commission percent/);
  const payee = page.getByLabel(/Paid to/);
  const before = { percent: await percent.inputValue(), payee: await payee.inputValue() };
  const person = `Alex ${testInfo.project.name}`;

  await percent.fill("abc");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("main").getByRole("alert").or(page.locator("main [aria-invalid=true]")).first()).toBeVisible();
  await expect(payee).toHaveValue(before.payee);

  await percent.fill("12.5");
  await payee.fill(person);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();

  await page.goto("/listings/new");
  await expect(page.getByLabel(/Share of profit/)).toHaveValue("12.5");
  await expect(page.getByLabel(/Paid to/)).toHaveValue(person);

  // Other specs run against the seeded defaults, so they are put back.
  await page.goto("/settings/commission");
  await percent.fill(before.percent);
  await payee.fill(before.payee);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
});
