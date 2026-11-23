import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { buildCategoryTree, flattenCategoryTree, loadCategories, type CategoryRecord } from "@/lib/domain/categories";
import { loadFeeRules, resolveFeeRule } from "@/lib/domain/fees";
import {
  SettingsError,
  createCategory,
  createMarketplace,
  deleteFeeRule,
  loadCategoryItemCounts,
  loadCommissionDefaults,
  loadMarketplaces,
  loadOwnerEmail,
  renameMarketplace,
  saveCommissionDefaults,
  saveFeeRule,
  setCategoryArchived,
  setMarketplaceArchived,
  updateCategory,
} from "./data";
import type { SaveFeeRuleInput } from "./schemas";

let t: TestDb;
let otherUserId: string;

beforeAll(async () => {
  t = await createTestDb();
  const other = await t.db.insertInto("app_user").values({ email: "other@second-story.test" }).returning("id").executeTakeFirstOrThrow();
  otherUserId = other.id;
});

afterAll(async () => {
  await t.close();
});

async function categories(): Promise<CategoryRecord[]> {
  return loadCategories(t.db, t.userId);
}

async function categoryByName(name: string): Promise<CategoryRecord> {
  const found = (await categories()).find((category) => category.name === name);
  if (!found) throw new Error(`No category called ${name}`);
  return found;
}

async function marketplaceId(name: string): Promise<string> {
  const found = (await loadMarketplaces(t.db, t.userId)).find((marketplace) => marketplace.name === name);
  if (!found) throw new Error(`No marketplace called ${name}`);
  return found.id;
}

/** Runs the call and returns the SettingsError it throws. Fails if it does not throw one. */
async function settingsError(call: () => Promise<unknown>): Promise<SettingsError> {
  try {
    await call();
  } catch (error) {
    if (error instanceof SettingsError) return error;
    throw error;
  }
  throw new Error("Expected a SettingsError");
}

const rule = (marketplace: string, categoryId: string | null, overrides: Partial<SaveFeeRuleInput> = {}): SaveFeeRuleInput => ({
  id: null,
  marketplaceId: marketplace,
  categoryId,
  percentBps: 1300,
  appliesToShipping: true,
  fixedCents: 40,
  paymentPercentBps: 0,
  paymentFixedCents: 0,
  ...overrides,
});

describe("categories", () => {
  it("adds a top-level category and a nested one, to any depth", async () => {
    const games = await createCategory(t.db, t.userId, { name: "Games", parentId: null });
    const nintendo = await createCategory(t.db, t.userId, { name: "Nintendo", parentId: games });
    const n64 = await createCategory(t.db, t.userId, { name: "N64", parentId: nintendo });
    const node = flattenCategoryTree(buildCategoryTree(await categories())).find((entry) => entry.id === n64);
    expect(node?.path).toEqual(["Games", "Nintendo", "N64"]);
  });

  it("refuses a duplicate name within a parent, case-insensitively", async () => {
    const movie = await categoryByName("Movie");
    const error = await settingsError(() => createCategory(t.db, t.userId, { name: "dvd", parentId: movie.id }));
    expect(error.field).toBe("name");
    expect(error.message).toContain("already exists under Movie");
    const top = await settingsError(() => createCategory(t.db, t.userId, { name: "BOOK", parentId: null }));
    expect(top.message).toContain("at the top level");
  });

  it("allows the same name under different parents", async () => {
    const book = await categoryByName("Book");
    await expect(createCategory(t.db, t.userId, { name: "DVD", parentId: book.id })).resolves.toEqual(expect.any(String));
  });

  it("refuses a parent that belongs to someone else", async () => {
    const foreign = await t.db
      .insertInto("category")
      .values({ user_id: otherUserId, parent_id: null, name: "Theirs" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const error = await settingsError(() => createCategory(t.db, t.userId, { name: "Mine", parentId: foreign.id }));
    expect(error.code).toBe("not_found");
    await expect(updateCategory(t.db, t.userId, { id: foreign.id, name: "Stolen", parentId: null })).rejects.toBeInstanceOf(SettingsError);
    const untouched = await t.db.selectFrom("category").select("name").where("id", "=", foreign.id).executeTakeFirstOrThrow();
    expect(untouched.name).toBe("Theirs");
  });

  it("renames a category, including a change of letter case only", async () => {
    const vhs = await categoryByName("VHS");
    await updateCategory(t.db, t.userId, { id: vhs.id, name: "Vhs tapes", parentId: vhs.parentId });
    await updateCategory(t.db, t.userId, { id: vhs.id, name: "VHS Tapes", parentId: vhs.parentId });
    expect((await categoryByName("VHS Tapes")).id).toBe(vhs.id);
    await updateCategory(t.db, t.userId, { id: vhs.id, name: "VHS", parentId: vhs.parentId });
  });

  it("refuses a rename onto a sibling's name", async () => {
    const vhs = await categoryByName("VHS");
    const error = await settingsError(() => updateCategory(t.db, t.userId, { id: vhs.id, name: "Blu-Ray", parentId: vhs.parentId }));
    expect(error.field).toBe("name");
  });

  it("moves a category to another parent and to the top level", async () => {
    const nintendo = await categoryByName("Nintendo");
    const movie = await categoryByName("Movie");
    await updateCategory(t.db, t.userId, { id: nintendo.id, name: "Nintendo", parentId: movie.id });
    expect((await categoryByName("Nintendo")).parentId).toBe(movie.id);
    // Its subcategory came along.
    expect((await categoryByName("N64")).parentId).toBe(nintendo.id);
    await updateCategory(t.db, t.userId, { id: nintendo.id, name: "Nintendo", parentId: null });
    expect((await categoryByName("Nintendo")).parentId).toBeNull();
    const games = await categoryByName("Games");
    await updateCategory(t.db, t.userId, { id: nintendo.id, name: "Nintendo", parentId: games.id });
  });

  it("refuses a move under itself or a descendant, and changes nothing", async () => {
    const games = await categoryByName("Games");
    const nintendo = await categoryByName("Nintendo");
    const n64 = await categoryByName("N64");
    const self = await settingsError(() => updateCategory(t.db, t.userId, { id: games.id, name: "Games", parentId: games.id }));
    expect(self.field).toBe("parentId");
    const child = await settingsError(() => updateCategory(t.db, t.userId, { id: games.id, name: "Games", parentId: nintendo.id }));
    expect(child.message).toContain("own subcategories");
    await expect(updateCategory(t.db, t.userId, { id: games.id, name: "Renamed", parentId: n64.id })).rejects.toBeInstanceOf(SettingsError);
    const after = await categoryByName("Games");
    expect(after.parentId).toBeNull();
  });

  it("refuses a move that would clash with a name under the new parent", async () => {
    const movie = await categoryByName("Movie");
    const bookDvd = (await categories()).find((category) => category.name === "DVD" && category.parentId !== movie.id);
    expect(bookDvd).toBeDefined();
    const error = await settingsError(() => updateCategory(t.db, t.userId, { id: bookDvd?.id ?? "", name: "DVD", parentId: movie.id }));
    expect(error.field).toBe("name");
  });

  it("archives and unarchives, keeps items, and hides the branch from pickers", async () => {
    const games = await categoryByName("Games");
    const n64 = await categoryByName("N64");
    await t.db.insertInto("inventory_item").values({ user_id: t.userId, title: "GoldenEye 007", category_id: n64.id }).execute();

    await setCategoryArchived(t.db, t.userId, { id: games.id, archived: true });
    const all = await categories();
    expect(all.find((category) => category.id === games.id)?.archived).toBe(true);
    // Only the one row is archived.
    expect(all.find((category) => category.id === n64.id)?.archived).toBe(false);
    const pickable = flattenCategoryTree(buildCategoryTree(all, { includeArchived: false })).map((node) => node.id);
    expect(pickable).not.toContain(games.id);
    expect(pickable).not.toContain(n64.id);
    const item = await t.db.selectFrom("inventory_item").select("category_id").where("title", "=", "GoldenEye 007").executeTakeFirstOrThrow();
    expect(item.category_id).toBe(n64.id);
    expect((await loadCategoryItemCounts(t.db, t.userId)).get(n64.id)).toBe(1);

    // Archiving again is harmless.
    await setCategoryArchived(t.db, t.userId, { id: games.id, archived: true });

    await setCategoryArchived(t.db, t.userId, { id: games.id, archived: false });
    const restored = flattenCategoryTree(buildCategoryTree(await categories(), { includeArchived: false })).map((node) => node.id);
    expect(restored).toContain(n64.id);
  });

  it("says so when a new name clashes with an archived category", async () => {
    const clothing = await categoryByName("Clothing");
    await setCategoryArchived(t.db, t.userId, { id: clothing.id, archived: true });
    const error = await settingsError(() => createCategory(t.db, t.userId, { name: "clothing", parentId: null }));
    expect(error.message).toContain("archived");
    expect(error.message).toContain("Unarchive");
  });

  it("refuses a new category or a move under an archived parent", async () => {
    const clothing = await categoryByName("Clothing");
    const book = await categoryByName("Book");
    const add = await settingsError(() => createCategory(t.db, t.userId, { name: "Shirts", parentId: clothing.id }));
    expect(add.field).toBe("parentId");
    const move = await settingsError(() => updateCategory(t.db, t.userId, { id: book.id, name: "Book", parentId: clothing.id }));
    expect(move.field).toBe("parentId");
    await setCategoryArchived(t.db, t.userId, { id: clothing.id, archived: false });
  });

  it("still lets a category under an archived parent be renamed in place", async () => {
    const movie = await categoryByName("Movie");
    const dvd = (await categories()).find((category) => category.name === "DVD" && category.parentId === movie.id);
    await setCategoryArchived(t.db, t.userId, { id: movie.id, archived: true });
    await updateCategory(t.db, t.userId, { id: dvd?.id ?? "", name: "DVDs", parentId: movie.id });
    await updateCategory(t.db, t.userId, { id: dvd?.id ?? "", name: "DVD", parentId: movie.id });
    await setCategoryArchived(t.db, t.userId, { id: movie.id, archived: false });
  });

  it("reports a category that does not exist", async () => {
    const missing = "0b0f7a52-58f3-4d0e-9f0e-1f6a1f1d2aff";
    expect((await settingsError(() => setCategoryArchived(t.db, t.userId, { id: missing, archived: true }))).code).toBe("not_found");
    expect((await settingsError(() => updateCategory(t.db, t.userId, { id: missing, name: "X", parentId: null }))).code).toBe("not_found");
  });
});

describe("marketplaces", () => {
  it("starts with the seeded list, ordered by name without regard to case", async () => {
    expect((await loadMarketplaces(t.db, t.userId)).map((marketplace) => marketplace.name)).toEqual([
      "eBay",
      "Facebook Marketplace",
      "Mercari",
      "Vinted",
    ]);
  });

  it("adds and renames", async () => {
    const id = await createMarketplace(t.db, t.userId, { name: "Etsy" });
    await renameMarketplace(t.db, t.userId, { id, name: "Etsy shop" });
    await renameMarketplace(t.db, t.userId, { id, name: "ETSY Shop" });
    expect(await marketplaceId("ETSY Shop")).toBe(id);
  });

  it("refuses a duplicate name, case-insensitively", async () => {
    const add = await settingsError(() => createMarketplace(t.db, t.userId, { name: "EBAY" }));
    expect(add.field).toBe("name");
    const mercari = await marketplaceId("Mercari");
    const rename = await settingsError(() => renameMarketplace(t.db, t.userId, { id: mercari, name: "vinted" }));
    expect(rename.field).toBe("name");
  });

  it("archives, blocks reuse of the name with a hint, and unarchives", async () => {
    const vinted = await marketplaceId("Vinted");
    await setMarketplaceArchived(t.db, t.userId, { id: vinted, archived: true });
    expect((await loadMarketplaces(t.db, t.userId)).find((marketplace) => marketplace.id === vinted)?.archived).toBe(true);
    const error = await settingsError(() => createMarketplace(t.db, t.userId, { name: "Vinted" }));
    expect(error.message).toContain("Unarchive");
    await setMarketplaceArchived(t.db, t.userId, { id: vinted, archived: false });
    expect((await loadMarketplaces(t.db, t.userId)).find((marketplace) => marketplace.id === vinted)?.archived).toBe(false);
  });

  it("does not touch another user's marketplace", async () => {
    const foreign = await t.db.insertInto("marketplace").values({ user_id: otherUserId, name: "Depop" }).returning("id").executeTakeFirstOrThrow();
    expect((await settingsError(() => renameMarketplace(t.db, t.userId, { id: foreign.id, name: "Mine" }))).code).toBe("not_found");
    expect((await settingsError(() => setMarketplaceArchived(t.db, t.userId, { id: foreign.id, archived: true }))).code).toBe("not_found");
    // Another user's name does not block mine.
    await expect(createMarketplace(t.db, t.userId, { name: "Depop" })).resolves.toEqual(expect.any(String));
  });
});

describe("fee rules", () => {
  it("ships with none", async () => {
    expect(await loadFeeRules(t.db, t.userId)).toEqual([]);
  });

  it("saves a default rule and a category rule, and the most specific one wins", async () => {
    const ebay = await marketplaceId("eBay");
    const movie = await categoryByName("Movie");
    const bluray = await categoryByName("Blu-ray");
    const book = await categoryByName("Book");
    const defaultId = await saveFeeRule(t.db, t.userId, rule(ebay, null));
    const movieId = await saveFeeRule(t.db, t.userId, rule(ebay, movie.id, { percentBps: 1495 }));

    const rules = await loadFeeRules(t.db, t.userId);
    const byId = new Map((await categories()).map((category) => [category.id, category]));
    expect(resolveFeeRule(rules, ebay, bluray.id, byId)?.id).toBe(movieId);
    expect(resolveFeeRule(rules, ebay, book.id, byId)?.id).toBe(defaultId);
    expect(resolveFeeRule(rules, await marketplaceId("Mercari"), book.id, byId)).toBeNull();
  });

  it("refuses a second default or a second rule for the same category", async () => {
    const ebay = await marketplaceId("eBay");
    const movie = await categoryByName("Movie");
    const second = await settingsError(() => saveFeeRule(t.db, t.userId, rule(ebay, null)));
    expect(second.field).toBe("categoryId");
    expect(second.message).toContain("default rule");
    const again = await settingsError(() => saveFeeRule(t.db, t.userId, rule(ebay, movie.id)));
    expect(again.message).toContain("rule for Movie");
  });

  it("edits a rule in place, including turning off applies to shipping", async () => {
    const ebay = await marketplaceId("eBay");
    const existing = (await loadFeeRules(t.db, t.userId)).find((entry) => entry.marketplaceId === ebay && entry.categoryId === null);
    const id = await saveFeeRule(
      t.db,
      t.userId,
      rule(ebay, null, {
        id: existing?.id ?? null,
        percentBps: 1325,
        appliesToShipping: false,
        fixedCents: 30,
        paymentPercentBps: 290,
        paymentFixedCents: 25,
      }),
    );
    expect(id).toBe(existing?.id);
    expect((await loadFeeRules(t.db, t.userId)).find((entry) => entry.id === id)).toEqual({
      id,
      marketplaceId: ebay,
      categoryId: null,
      percentBps: 1325,
      appliesToShipping: false,
      fixedCents: 30,
      paymentPercentBps: 290,
      paymentFixedCents: 25,
    });
  });

  it("refuses to edit a rule onto a category another rule covers", async () => {
    const ebay = await marketplaceId("eBay");
    const movie = await categoryByName("Movie");
    const defaultRule = (await loadFeeRules(t.db, t.userId)).find((entry) => entry.marketplaceId === ebay && entry.categoryId === null);
    const error = await settingsError(() => saveFeeRule(t.db, t.userId, rule(ebay, movie.id, { id: defaultRule?.id ?? null })));
    expect(error.field).toBe("categoryId");
  });

  it("refuses a marketplace or category that is missing or someone else's", async () => {
    const ebay = await marketplaceId("eBay");
    const missing = "0b0f7a52-58f3-4d0e-9f0e-1f6a1f1d2aff";
    expect((await settingsError(() => saveFeeRule(t.db, t.userId, rule(missing, null)))).code).toBe("not_found");
    expect((await settingsError(() => saveFeeRule(t.db, t.userId, rule(ebay, missing)))).field).toBe("categoryId");
    const foreign = await t.db.selectFrom("marketplace").select("id").where("user_id", "=", otherUserId).executeTakeFirstOrThrow();
    expect((await settingsError(() => saveFeeRule(t.db, t.userId, rule(foreign.id, null)))).code).toBe("not_found");
  });

  it("reports an edit of a rule that is gone", async () => {
    const mercari = await marketplaceId("Mercari");
    const error = await settingsError(() =>
      saveFeeRule(t.db, t.userId, rule(mercari, null, { id: "0b0f7a52-58f3-4d0e-9f0e-1f6a1f1d2aff" })),
    );
    expect(error.code).toBe("not_found");
    expect(await loadFeeRules(t.db, t.userId)).toHaveLength(2);
  });

  it("deletes a rule, and only the owner's", async () => {
    const mercari = await marketplaceId("Mercari");
    const id = await saveFeeRule(t.db, t.userId, rule(mercari, null));
    await deleteFeeRule(t.db, otherUserId, id);
    expect((await loadFeeRules(t.db, t.userId)).some((entry) => entry.id === id)).toBe(true);
    await deleteFeeRule(t.db, t.userId, id);
    expect((await loadFeeRules(t.db, t.userId)).some((entry) => entry.id === id)).toBe(false);
  });
});

describe("commission and account", () => {
  it("starts empty", async () => {
    expect(await loadCommissionDefaults(t.db, t.userId)).toEqual({ defaultCommissionBps: null, defaultCommissionPayee: null });
  });

  it("saves, changes and clears the defaults", async () => {
    await saveCommissionDefaults(t.db, t.userId, { defaultCommissionBps: 2000, defaultCommissionPayee: "Sam" });
    expect(await loadCommissionDefaults(t.db, t.userId)).toEqual({ defaultCommissionBps: 2000, defaultCommissionPayee: "Sam" });
    await saveCommissionDefaults(t.db, t.userId, { defaultCommissionBps: 1250, defaultCommissionPayee: null });
    expect(await loadCommissionDefaults(t.db, t.userId)).toEqual({ defaultCommissionBps: 1250, defaultCommissionPayee: null });
    await saveCommissionDefaults(t.db, t.userId, { defaultCommissionBps: null, defaultCommissionPayee: null });
    expect(await loadCommissionDefaults(t.db, t.userId)).toEqual({ defaultCommissionBps: null, defaultCommissionPayee: null });
  });

  it("creates the settings row for a user who has none", async () => {
    await saveCommissionDefaults(t.db, otherUserId, { defaultCommissionBps: 500, defaultCommissionPayee: "Alex" });
    expect(await loadCommissionDefaults(t.db, otherUserId)).toEqual({ defaultCommissionBps: 500, defaultCommissionPayee: "Alex" });
    expect((await loadCommissionDefaults(t.db, t.userId)).defaultCommissionBps).toBeNull();
  });

  it("loads the owner email", async () => {
    expect(await loadOwnerEmail(t.db, t.userId)).toBe("test@second-story.test");
  });
});
