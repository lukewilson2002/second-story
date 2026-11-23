import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { NO_FEES } from "@/lib/calc";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import {
  DomainError,
  buildCategoryTree,
  categoriesById,
  categoryAncestorIds,
  categoryCode,
  categoryPath,
  categoryWithDescendantIds,
  deriveItemStatus,
  flattenCategoryTree,
  listingCostFor,
  loadActivelyListedItemIds,
  loadCategories,
  loadFeeRules,
  loadListingCosts,
  loadListingSoldQuantities,
  loadPurchaseSummaries,
  previewSale,
  projectListingMarketplace,
  purchaseSummaryFor,
  recordSale,
  resolveFeeRule,
  resolveFeeTerms,
  saleRowProfit,
  summarizePurchases,
  topLevelCategoryId,
  type CategoryRecord,
  type FeeRuleRecord,
} from "./index";

const cat = (id: string, parentId: string | null, name: string, archived = false): CategoryRecord => ({
  id,
  parentId,
  name,
  archived,
});

const CATEGORIES = [
  cat("movie", null, "Movie"),
  cat("dvd", "movie", "DVD"),
  cat("bluray", "movie", "Blu-ray"),
  cat("criterion", "bluray", "Criterion"),
  cat("book", null, "Book"),
  cat("vhs", "movie", "VHS", true),
  cat("tapes", "vhs", "Rental tapes"),
];

describe("category helpers", () => {
  const byId = categoriesById(CATEGORIES);

  it("builds a sorted tree with depth and path", () => {
    const tree = buildCategoryTree(CATEGORIES);
    expect(tree.map((node) => node.name)).toEqual(["Book", "Movie"]);
    const movie = tree[1];
    expect(movie?.children.map((node) => node.name)).toEqual(["Blu-ray", "DVD", "VHS"]);
    expect(movie?.children[0]?.children[0]).toMatchObject({
      name: "Criterion",
      depth: 2,
      path: ["Movie", "Blu-ray", "Criterion"],
    });
  });

  it("leaves archived categories and their children out of pickers", () => {
    const names = flattenCategoryTree(buildCategoryTree(CATEGORIES, { includeArchived: false })).map(
      (node) => node.name,
    );
    expect(names).toEqual(["Book", "Movie", "Blu-ray", "Criterion", "DVD"]);
  });

  it("treats a category with a missing parent as top level", () => {
    const tree = buildCategoryTree([cat("orphan", "gone", "Orphan")]);
    expect(tree.map((node) => node.name)).toEqual(["Orphan"]);
  });

  it("does not loop on a parent cycle", () => {
    const cyclic = [cat("a", "b", "A"), cat("b", "a", "B")];
    expect(buildCategoryTree(cyclic)).toEqual([]);
    expect(categoryAncestorIds("a", categoriesById(cyclic))).toEqual(["a", "b"]);
  });

  it("walks up to the top level", () => {
    expect(categoryAncestorIds("criterion", byId)).toEqual(["criterion", "bluray", "movie"]);
    expect(categoryAncestorIds("book", byId)).toEqual(["book"]);
    expect(categoryAncestorIds("missing", byId)).toEqual([]);
    expect(topLevelCategoryId("criterion", byId)).toBe("movie");
    expect(topLevelCategoryId("book", byId)).toBe("book");
  });

  it("formats the full path", () => {
    expect(categoryPath("dvd", byId)).toBe("Movie › DVD");
    expect(categoryPath("book", byId)).toBe("Book");
    expect(categoryPath("missing", byId)).toBe("");
  });

  it("collects a category and its descendants", () => {
    expect(categoryWithDescendantIds("movie", CATEGORIES).sort()).toEqual(
      ["bluray", "criterion", "dvd", "movie", "tapes", "vhs"].sort(),
    );
    expect(categoryWithDescendantIds("book", CATEGORIES)).toEqual(["book"]);
  });

  it("makes short thumbnail codes", () => {
    expect(categoryCode("Book")).toBe("BK");
    expect(categoryCode("Clothing")).toBe("CL");
    expect(categoryCode("DVD")).toBe("DVD");
    expect(categoryCode("VHS")).toBe("VHS");
    expect(categoryCode("N64")).toBe("N64");
    expect(categoryCode("Blu-ray")).toBe("BR");
    expect(categoryCode("Video games")).toBe("VG");
    expect(categoryCode("")).toBe("?");
  });
});

describe("resolveFeeRule", () => {
  const byId = categoriesById(CATEGORIES);
  const feeRule = (id: string, marketplaceId: string, categoryId: string | null, percentBps: number): FeeRuleRecord => ({
    ...NO_FEES,
    id,
    marketplaceId,
    categoryId,
    percentBps,
  });
  const rules = [
    feeRule("ebay-default", "ebay", null, 1300),
    feeRule("ebay-movie", "ebay", "movie", 1500),
    feeRule("ebay-bluray", "ebay", "bluray", 1000),
    feeRule("mercari-default", "mercari", null, 1000),
    feeRule("vinted-book", "vinted", "book", 500),
  ];

  it("uses the rule for the exact category", () => {
    expect(resolveFeeRule(rules, "ebay", "bluray", byId)?.id).toBe("ebay-bluray");
  });

  it("walks up to the nearest ancestor with a rule", () => {
    expect(resolveFeeRule(rules, "ebay", "criterion", byId)?.id).toBe("ebay-bluray");
    expect(resolveFeeRule(rules, "ebay", "dvd", byId)?.id).toBe("ebay-movie");
  });

  it("falls back to the marketplace default", () => {
    expect(resolveFeeRule(rules, "ebay", "book", byId)?.id).toBe("ebay-default");
    expect(resolveFeeRule(rules, "mercari", "criterion", byId)?.id).toBe("mercari-default");
  });

  it("uses the default when there is no category or the category is unknown", () => {
    expect(resolveFeeRule(rules, "ebay", null, byId)?.id).toBe("ebay-default");
    expect(resolveFeeRule(rules, "ebay", "missing", byId)?.id).toBe("ebay-default");
  });

  it("never uses another marketplace's rule", () => {
    expect(resolveFeeRule(rules, "vinted", "book", byId)?.id).toBe("vinted-book");
    expect(resolveFeeRule(rules, "vinted", "dvd", byId)).toBeNull();
    expect(resolveFeeRule(rules, "facebook", "book", byId)).toBeNull();
  });

  it("charges nothing when no rule is set", () => {
    expect(resolveFeeTerms(rules, "facebook", "book", byId)).toEqual(NO_FEES);
    expect(resolveFeeTerms(rules, "ebay", "book", byId).percentBps).toBe(1300);
  });
});

describe("item helpers", () => {
  it("summarizes purchases", () => {
    expect(
      summarizePurchases([
        { quantity: 1, unitCostCents: 100, purchasedAt: "2026-10-03" },
        { quantity: 3, unitCostCents: 500, purchasedAt: "2026-08-02" },
        { quantity: 1, unitCostCents: 401, purchasedAt: "2026-11-18" },
      ]),
    ).toEqual({
      avgUnitCostCents: 400,
      totalQuantity: 5,
      totalCostCents: 2001,
      firstPurchasedAt: "2026-08-02",
      lastPurchasedAt: "2026-11-18",
    });
  });

  it("summarizes no purchases as zero", () => {
    expect(summarizePurchases([])).toEqual({
      avgUnitCostCents: 0,
      totalQuantity: 0,
      totalCostCents: 0,
      firstPurchasedAt: null,
      lastPurchasedAt: null,
    });
  });

  it("derives status", () => {
    expect(deriveItemStatus({ quantityOnHand: 2, inActiveListing: false })).toBe("in_stock");
    expect(deriveItemStatus({ quantityOnHand: 2, inActiveListing: true })).toBe("listed");
    expect(deriveItemStatus({ quantityOnHand: 0, inActiveListing: true })).toBe("sold_out");
    expect(deriveItemStatus({ quantityOnHand: 0, inActiveListing: false })).toBe("sold_out");
  });
});

describe("projectListingMarketplace", () => {
  const listing = {
    askingPriceCents: 4499,
    shippingChargedCents: 500,
    estShippingCostCents: 560,
    commissionBps: 2000,
  };

  it("matches the eBay figures on the listing board", () => {
    const projection = projectListingMarketplace({
      listing,
      marketplaceAskingPriceCents: null,
      unitCostCents: 1800,
      rule: { ...NO_FEES, percentBps: 1300, fixedCents: 40 },
    });
    expect(projection.askingPriceCents).toBe(4499);
    expect(projection.minimumPriceCents).toBe(2259);
    expect(projection.aboveMinimumCents).toBe(2240);
    expect(projection.belowMinimum).toBe(false);
    expect(projection.atAsking.profitCents).toBe(1559);
  });

  it("matches the Mercari minimum on the listing board", () => {
    const projection = projectListingMarketplace({
      listing,
      marketplaceAskingPriceCents: null,
      unitCostCents: 1800,
      rule: { ...NO_FEES, percentBps: 1000, fixedCents: 50 },
    });
    expect(projection.minimumPriceCents).toBe(2178);
    expect(projection.aboveMinimumCents).toBe(2321);
  });

  it("uses the marketplace price override and flags a price below the minimum", () => {
    const projection = projectListingMarketplace({
      listing,
      marketplaceAskingPriceCents: 2000,
      unitCostCents: 1800,
      rule: { ...NO_FEES, percentBps: 1300, fixedCents: 40 },
    });
    expect(projection.askingPriceCents).toBe(2000);
    expect(projection.aboveMinimumCents).toBe(-259);
    expect(projection.belowMinimum).toBe(true);
    expect(projection.atAsking.profitCents).toBeLessThan(0);
  });

  it("flags a listing that can never break even", () => {
    const projection = projectListingMarketplace({
      listing,
      marketplaceAskingPriceCents: null,
      unitCostCents: 1800,
      rule: { ...NO_FEES, percentBps: 10_000 },
    });
    expect(projection.minimumPriceCents).toBeNull();
    expect(projection.aboveMinimumCents).toBeNull();
    expect(projection.belowMinimum).toBe(true);
  });
});

describe("saleRowProfit", () => {
  it("works from the snapshotted columns", () => {
    expect(
      saleRowProfit({
        sale_price_cents: 4499,
        shipping_charged_cents: 500,
        shipping_cost_cents: 560,
        marketplace_fee_cents: 690,
        additional_fees_cents: 0,
        cost_of_goods_cents: 1800,
        commission_cents: 390,
      }),
    ).toEqual({ revenueCents: 4999, profitBeforeCommissionCents: 1949, profitCents: 1559 });
  });
});

describe("recordSale and the database helpers", () => {
  let t: TestDb;
  let ebay: string;
  let mercari: string;
  let vinted: string;
  let dvd: string;
  let book: string;

  async function addItem(title: string, categoryId: string, purchases: [quantity: number, unitCostCents: number, date: string][]) {
    const quantity = purchases.reduce((sum, [q]) => sum + q, 0);
    const item = await t.db
      .insertInto("inventory_item")
      .values({ user_id: t.userId, title, category_id: categoryId, quantity_on_hand: quantity })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("purchase")
      .values(
        purchases.map(([q, unitCostCents, purchasedAt]) => ({
          user_id: t.userId,
          item_id: item.id,
          quantity: q,
          unit_cost_cents: unitCostCents,
          purchased_at: purchasedAt,
        })),
      )
      .execute();
    return item.id;
  }

  async function addListing(options: {
    title: string;
    items: [itemId: string, quantityPerUnit: number][];
    marketplaces: string[];
    quantity?: number;
    status?: "draft" | "active";
    commissionBps?: number | null;
    shippingChargedCents?: number;
  }) {
    const listing = await t.db
      .insertInto("listing")
      .values({
        user_id: t.userId,
        title: options.title,
        status: options.status ?? "active",
        asking_price_cents: 4499,
        quantity: options.quantity ?? 1,
        shipping_charged_cents: options.shippingChargedCents ?? 500,
        commission_bps: options.commissionBps ?? null,
        listed_at: new Date(),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t.db
      .insertInto("listing_item")
      .values(
        options.items.map(([itemId, quantityPerUnit], position) => ({
          user_id: t.userId,
          listing_id: listing.id,
          item_id: itemId,
          quantity_per_unit: quantityPerUnit,
          position,
        })),
      )
      .execute();
    await t.db
      .insertInto("listing_marketplace")
      .values(
        options.marketplaces.map((marketplaceId) => ({
          user_id: t.userId,
          listing_id: listing.id,
          marketplace_id: marketplaceId,
          listed_at: new Date(),
        })),
      )
      .execute();
    return listing.id;
  }

  const onHand = async (itemId: string) =>
    (await t.db.selectFrom("inventory_item").select("quantity_on_hand").where("id", "=", itemId).executeTakeFirstOrThrow())
      .quantity_on_hand;

  beforeAll(async () => {
    t = await createTestDb();
    const marketplaces = await t.db.selectFrom("marketplace").select(["id", "name"]).where("user_id", "=", t.userId).execute();
    const marketplaceId = (name: string) => {
      const found = marketplaces.find((m) => m.name === name);
      if (!found) throw new Error(`missing marketplace ${name}`);
      return found.id;
    };
    ebay = marketplaceId("eBay");
    mercari = marketplaceId("Mercari");
    vinted = marketplaceId("Vinted");
    const categories = await loadCategories(t.db, t.userId);
    const categoryId = (name: string) => {
      const found = categories.find((c) => c.name === name);
      if (!found) throw new Error(`missing category ${name}`);
      return found.id;
    };
    dvd = categoryId("DVD");
    book = categoryId("Book");
    await t.db
      .insertInto("fee_rule")
      .values([
        { user_id: t.userId, marketplace_id: ebay, category_id: null, percent_bps: 1300, fixed_cents: 40 },
        { user_id: t.userId, marketplace_id: ebay, category_id: categoryId("Movie"), percent_bps: 1500, fixed_cents: 40 },
        { user_id: t.userId, marketplace_id: mercari, category_id: null, percent_bps: 1000, fixed_cents: 50 },
      ])
      .execute();
  });

  afterAll(async () => {
    await t.close();
  });

  it("seeds the starter categories and marketplaces once", async () => {
    const categories = await loadCategories(t.db, t.userId);
    expect(categories.map((c) => c.name).sort()).toEqual(["Blu-ray", "Book", "Clothing", "DVD", "Movie", "VHS"]);
    const byId = categoriesById(categories);
    expect(categoryPath(dvd, byId)).toBe("Movie › DVD");
    const marketplaces = await t.db.selectFrom("marketplace").select("name").where("user_id", "=", t.userId).execute();
    expect(marketplaces.map((m) => m.name).sort()).toEqual(["Facebook Marketplace", "Mercari", "Vinted", "eBay"]);
    expect(await loadFeeRules(t.db, t.userId)).toHaveLength(3);
  });

  it("returns dates as strings and sums as numbers", async () => {
    const item = await addItem("Type check", book, [
      [1, 100, "2026-10-03"],
      [3, 500, "2026-08-02"],
    ]);
    const summary = purchaseSummaryFor(await loadPurchaseSummaries(t.db, t.userId, [item]), item);
    expect(summary).toEqual({
      avgUnitCostCents: 400,
      totalQuantity: 4,
      totalCostCents: 1600,
      firstPurchasedAt: "2026-08-02",
      lastPurchasedAt: "2026-10-03",
    });
    expect(purchaseSummaryFor(new Map(), "nothing").avgUnitCostCents).toBe(0);
    expect(await loadPurchaseSummaries(t.db, t.userId, [])).toEqual(new Map());
  });

  it("snapshots cost, fee and commission, takes stock, and marks the listing sold", async () => {
    const zelda = await addItem("Zelda", book, [[2, 1400, "2026-11-14"]]);
    const pak = await addItem("Expansion Pak", book, [[1, 400, "2026-11-14"]]);
    const listing = await addListing({
      title: "Zelda bundle",
      items: [
        [zelda, 1],
        [pak, 1],
      ],
      marketplaces: [ebay, mercari],
      commissionBps: 2000,
    });

    expect((await loadActivelyListedItemIds(t.db, t.userId)).has(zelda)).toBe(true);
    const cost = listingCostFor(await loadListingCosts(t.db, t.userId, [listing]), listing);
    expect(cost.unitCostCents).toBe(1800);
    expect(cost.feeCategoryId).toBe(book);
    expect(cost.items.map((item) => item.title)).toEqual(["Zelda", "Expansion Pak"]);

    const input = {
      listingId: listing,
      marketplaceId: ebay,
      soldAt: "2026-11-22",
      salePriceCents: 4499,
      shippingCostCents: 560,
    };
    const preview = await previewSale(t.db, t.userId, input);
    expect(preview.marketplaceFeeCents).toBe(690);
    expect(await onHand(zelda)).toBe(2);

    const sale = await recordSale(t.db, t.userId, input);
    expect(sale.shippingChargedCents).toBe(500);
    expect(sale.costOfGoodsCents).toBe(1800);
    expect(sale.marketplaceFeeCents).toBe(690);
    expect(sale.breakdown.commissionCents).toBe(390);
    expect(sale.breakdown.profitCents).toBe(1559);
    expect(sale.listingSoldOut).toBe(true);
    expect(sale.stillActiveOnMarketplaceIds).toEqual([mercari]);

    const row = await t.db.selectFrom("sale").selectAll().where("id", "=", sale.saleId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      sold_at: "2026-11-22",
      quantity: 1,
      sale_price_cents: 4499,
      shipping_charged_cents: 500,
      shipping_cost_cents: 560,
      marketplace_fee_cents: 690,
      additional_fees_cents: 0,
      cost_of_goods_cents: 1800,
      commission_cents: 390,
      commission_paid_at: null,
    });
    expect(saleRowProfit(row).profitCents).toBe(1559);

    expect(await onHand(zelda)).toBe(1);
    expect(await onHand(pak)).toBe(0);

    const after = await t.db.selectFrom("listing").select(["status", "ended_at"]).where("id", "=", listing).executeTakeFirstOrThrow();
    expect(after.status).toBe("sold");
    expect(after.ended_at).toBeInstanceOf(Date);
    const rows = await t.db
      .selectFrom("listing_marketplace")
      .select(["marketplace_id", "status"])
      .where("listing_id", "=", listing)
      .execute();
    expect(rows.find((r) => r.marketplace_id === ebay)?.status).toBe("ended");
    expect(rows.find((r) => r.marketplace_id === mercari)?.status).toBe("active");
    expect((await loadActivelyListedItemIds(t.db, t.userId)).has(zelda)).toBe(false);

    await expect(recordSale(t.db, t.userId, input)).rejects.toMatchObject({ code: "listing_not_active" });
  });

  it("keeps a multi-quantity listing active until its last unit sells", async () => {
    const dune = await addItem("Dune", book, [
      [3, 200, "2026-11-01"],
      [2, 300, "2026-11-18"],
    ]);
    const listing = await addListing({ title: "Dune", items: [[dune, 1]], marketplaces: [mercari], quantity: 5, shippingChargedCents: 400 });

    const first = await recordSale(t.db, t.userId, {
      listingId: listing,
      marketplaceId: mercari,
      soldAt: "2026-11-20",
      quantity: 2,
      salePriceCents: 3600,
      shippingCostCents: 800,
      additionalFeesCents: 100,
    });
    // Average unit cost is (600 + 600) / 5 = 240. Shipping charged defaults to 400 × 2.
    expect(first.costOfGoodsCents).toBe(480);
    expect(first.shippingChargedCents).toBe(800);
    // 10% of (3600 + 800) + 50
    expect(first.marketplaceFeeCents).toBe(490);
    expect(first.breakdown.profitBeforeCommissionCents).toBe(3600 + 800 - 490 - 800 - 100 - 480);
    expect(first.breakdown.commissionCents).toBe(0);
    expect(first.listingSoldOut).toBe(false);
    expect(first.remainingBefore).toBe(5);
    expect(await onHand(dune)).toBe(3);
    expect((await loadListingSoldQuantities(t.db, t.userId, [listing])).get(listing)).toBe(2);

    await expect(
      recordSale(t.db, t.userId, { listingId: listing, marketplaceId: mercari, soldAt: "2026-11-21", quantity: 4, salePriceCents: 100 }),
    ).rejects.toMatchObject({ code: "not_enough_listing_quantity", message: "This listing has 3 units left." });

    const last = await recordSale(t.db, t.userId, {
      listingId: listing,
      marketplaceId: mercari,
      soldAt: "2026-11-21",
      quantity: 3,
      salePriceCents: 5400,
      shippingChargedCents: 0,
    });
    expect(last.listingSoldOut).toBe(true);
    expect(last.stillActiveOnMarketplaceIds).toEqual([]);
    expect(await onHand(dune)).toBe(0);
  });

  it("uses the category fee rule of the first item and honours a fee override", async () => {
    const matrix = await addItem("The Matrix", dvd, [[4, 75, "2026-09-20"]]);
    const listing = await addListing({ title: "The Matrix DVD", items: [[matrix, 2]], marketplaces: [ebay], quantity: 2, shippingChargedCents: 0 });
    const preview = await previewSale(t.db, t.userId, {
      listingId: listing,
      marketplaceId: ebay,
      soldAt: "2026-11-20",
      salePriceCents: 600,
    });
    // DVD has no rule, so it walks up to Movie: 15% of 600 + 40.
    expect(preview.marketplaceFeeCents).toBe(130);
    expect(preview.costOfGoodsCents).toBe(150);

    const sale = await recordSale(t.db, t.userId, {
      listingId: listing,
      marketplaceId: ebay,
      soldAt: "2026-11-20",
      salePriceCents: 600,
      marketplaceFeeCents: 99,
    });
    expect(sale.marketplaceFeeCents).toBe(99);
    expect(sale.ruleFeeCents).toBe(130);
    expect(sale.breakdown.profitCents).toBe(600 - 99 - 150);
    expect(await onHand(matrix)).toBe(2);
  });

  it("charges no fee when the marketplace has no rule", async () => {
    const jeans = await addItem("Jeans", book, [[1, 650, "2026-10-28"]]);
    const listing = await addListing({ title: "Jeans", items: [[jeans, 1]], marketplaces: [vinted] });
    const sale = await recordSale(t.db, t.userId, { listingId: listing, marketplaceId: vinted, soldAt: "2026-11-21", salePriceCents: 2800 });
    expect(sale.marketplaceFeeCents).toBe(0);
  });

  it("rejects bad sales and writes nothing", async () => {
    const item = await addItem("Guarded", book, [[1, 100, "2026-11-01"]]);
    const draft = await addListing({ title: "Draft", items: [[item, 1]], marketplaces: [ebay], status: "draft" });
    const active = await addListing({ title: "Active", items: [[item, 2]], marketplaces: [ebay] });
    const base = { soldAt: "2026-11-21", salePriceCents: 1000 };
    const salesBefore = await t.db.selectFrom("sale").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();

    await expect(recordSale(t.db, t.userId, { ...base, listingId: draft, marketplaceId: ebay })).rejects.toMatchObject({
      code: "listing_not_active",
    });
    await expect(recordSale(t.db, t.userId, { ...base, listingId: active, marketplaceId: mercari })).rejects.toMatchObject({
      code: "not_on_marketplace",
    });
    await expect(recordSale(t.db, t.userId, { ...base, listingId: active, marketplaceId: ebay })).rejects.toMatchObject({
      code: "not_enough_stock",
    });
    await expect(
      recordSale(t.db, t.userId, { ...base, listingId: "00000000-0000-4000-8000-000000000000", marketplaceId: ebay }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(
      recordSale(t.db, t.userId, { ...base, listingId: active, marketplaceId: ebay, soldAt: "2026-02-30" }),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      recordSale(t.db, t.userId, { ...base, listingId: active, marketplaceId: ebay, salePriceCents: 10.5 }),
    ).rejects.toMatchObject({ code: "invalid" });

    const salesAfter = await t.db.selectFrom("sale").select((eb) => eb.fn.countAll<number>().as("n")).executeTakeFirstOrThrow();
    expect(salesAfter.n).toBe(salesBefore.n);
    expect(typeof salesAfter.n).toBe("number");
    expect(await onHand(item)).toBe(1);
  });

  it("rejects a sale on a marketplace the listing was taken down from", async () => {
    const item = await addItem("Taken down", book, [[1, 100, "2026-11-01"]]);
    const listing = await addListing({ title: "Taken down", items: [[item, 1]], marketplaces: [ebay, mercari] });
    await t.db
      .updateTable("listing_marketplace")
      .set({ status: "ended", ended_at: new Date() })
      .where("listing_id", "=", listing)
      .where("marketplace_id", "=", mercari)
      .execute();
    const input = { listingId: listing, soldAt: "2026-11-21", salePriceCents: 1000 };

    await expect(previewSale(t.db, t.userId, { ...input, marketplaceId: mercari })).rejects.toMatchObject({ code: "not_on_marketplace" });
    await expect(recordSale(t.db, t.userId, { ...input, marketplaceId: mercari })).rejects.toMatchObject({ code: "not_on_marketplace" });
    expect(await onHand(item)).toBe(1);

    const sale = await recordSale(t.db, t.userId, { ...input, marketplaceId: ebay });
    expect(sale.listingSoldOut).toBe(true);
    expect(sale.stillActiveOnMarketplaceIds).toEqual([]);
  });

  it("does not let another user sell a listing", async () => {
    const item = await addItem("Private", book, [[1, 100, "2026-11-01"]]);
    const listing = await addListing({ title: "Private", items: [[item, 1]], marketplaces: [ebay] });
    const other = await t.db.insertInto("app_user").values({ email: "other@second-story.test" }).returning("id").executeTakeFirstOrThrow();
    await expect(
      recordSale(t.db, other.id, { listingId: listing, marketplaceId: ebay, soldAt: "2026-11-21", salePriceCents: 1000 }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("lets only one of two simultaneous sales take the last unit", async () => {
    const item = await addItem("Last one", book, [[1, 100, "2026-11-01"]]);
    const listing = await addListing({ title: "Last one", items: [[item, 1]], marketplaces: [ebay, mercari] });
    const results = await Promise.allSettled([
      recordSale(t.db, t.userId, { listingId: listing, marketplaceId: ebay, soldAt: "2026-11-21", salePriceCents: 1000 }),
      recordSale(t.db, t.userId, { listingId: listing, marketplaceId: mercari, soldAt: "2026-11-21", salePriceCents: 1000 }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await onHand(item)).toBe(0);
    const sales = await t.db.selectFrom("sale").select("id").where("listing_id", "=", listing).execute();
    expect(sales).toHaveLength(1);
  });

  it("rolls everything back when it runs inside a transaction that fails", async () => {
    const item = await addItem("Rollback", book, [[1, 100, "2026-11-01"]]);
    const listing = await addListing({ title: "Rollback", items: [[item, 1]], marketplaces: [ebay] });
    await expect(
      t.db.transaction().execute(async (trx) => {
        await recordSale(trx, t.userId, { listingId: listing, marketplaceId: ebay, soldAt: "2026-11-21", salePriceCents: 1000 });
        throw new Error("later step failed");
      }),
    ).rejects.toThrow("later step failed");
    expect(await onHand(item)).toBe(1);
    const after = await t.db.selectFrom("listing").select("status").where("id", "=", listing).executeTakeFirstOrThrow();
    expect(after.status).toBe("active");
  });

  it("enforces the unique rules that involve nulls", async () => {
    await expect(
      t.db.insertInto("category").values({ user_id: t.userId, parent_id: null, name: "book" }).execute(),
    ).rejects.toThrow();
    await expect(
      t.db.insertInto("fee_rule").values({ user_id: t.userId, marketplace_id: ebay, category_id: null, percent_bps: 100 }).execute(),
    ).rejects.toThrow();
    await expect(
      t.db.insertInto("marketplace").values({ user_id: t.userId, name: "EBAY" }).execute(),
    ).rejects.toThrow();
  });
});
