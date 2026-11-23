import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedBase } from "@/lib/db/seed";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { recordSale } from "@/lib/domain";
import { monthRange, monthsEndingAt, weeksEndingAt } from "./month";
import {
  countListingsBelowMinimum,
  countSoldStillUp,
  countStaleListings,
  countUnlistedItems,
  loadActiveListingSummary,
  loadAverageDaysToSell,
  loadCommissionOwedCents,
  loadDashboard,
  loadEarliestMonth,
  loadMonthlyTrend,
  loadPeriodSummary,
  loadProfitByCategory,
  loadProfitByMarketplace,
  loadRecentSales,
  loadSpendVsRevenue,
  loadStockSummary,
  loadWeeklyTrend,
} from "./queries";

// A Monday, so the weekly buckets are easy to read.
const TODAY = "2026-11-23";
const NOVEMBER = monthRange("2026-11");
const OCTOBER = monthRange("2026-10");

let t: TestDb;
let otherUserId: string;

beforeAll(async () => {
  t = await createTestDb();
  const { db, userId } = t;

  const idByName = async (table: "category" | "marketplace", name: string) => {
    const row = await db
      .selectFrom(table)
      .select("id")
      .where("user_id", "=", userId)
      .where("name", "=", name)
      .executeTakeFirstOrThrow();
    return row.id;
  };
  const book = await idByName("category", "Book");
  const dvd = await idByName("category", "DVD");
  const ebay = await idByName("marketplace", "eBay");
  const mercari = await idByName("marketplace", "Mercari");

  await db.insertInto("fee_rule").values({ user_id: userId, marketplace_id: ebay, category_id: null, percent_bps: 1000 }).execute();

  const addItem = async (
    title: string,
    categoryId: string,
    quantityOnHand: number,
    purchases: { at: string; quantity: number; unitCostCents: number }[],
  ) => {
    const item = await db
      .insertInto("inventory_item")
      .values({
        user_id: userId,
        title,
        category_id: categoryId,
        quantity_on_hand: quantityOnHand,
        created_at: new Date("2026-11-20T12:00:00Z"),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    for (const purchase of purchases) {
      await db
        .insertInto("purchase")
        .values({
          user_id: userId,
          item_id: item.id,
          purchased_at: purchase.at,
          quantity: purchase.quantity,
          unit_cost_cents: purchase.unitCostCents,
        })
        .execute();
    }
    return item.id;
  };

  const addListing = async (input: {
    title: string;
    itemId: string;
    quantity: number;
    askingPriceCents: number;
    listedAt: string;
    marketplaces: string[];
    commissionBps?: number;
  }) => {
    const listing = await db
      .insertInto("listing")
      .values({
        user_id: userId,
        title: input.title,
        status: "active",
        asking_price_cents: input.askingPriceCents,
        quantity: input.quantity,
        commission_bps: input.commissionBps ?? null,
        listed_at: new Date(`${input.listedAt}T12:00:00Z`),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("listing_item").values({ user_id: userId, listing_id: listing.id, item_id: input.itemId }).execute();
    await db
      .insertInto("listing_marketplace")
      .values(input.marketplaces.map((id) => ({ user_id: userId, listing_id: listing.id, marketplace_id: id })))
      .execute();
    return listing.id;
  };

  // Average cost $6.00. Two of the three units sell below, so one unit from the newest purchase is left.
  const dune = await addItem("Dune", book, 3, [
    { at: "2026-08-01", quantity: 2, unitCostCents: 500 },
    { at: "2026-11-10", quantity: 1, unitCostCents: 800 },
  ]);
  const matrix = await addItem("The Matrix", dvd, 1, [{ at: "2026-10-20", quantity: 1, unitCostCents: 300 }]);
  // Five on hand but only four ever purchased: the extra unit is a hand correction.
  const hobbit = await addItem("The Hobbit", book, 5, [{ at: "2026-05-01", quantity: 4, unitCostCents: 100 }]);
  // No purchases and no listing.
  await addItem("Mystery box", book, 2, []);

  const duneListing = await addListing({
    title: "Dune, hardcover",
    itemId: dune,
    quantity: 3,
    askingPriceCents: 2000,
    listedAt: "2026-08-05",
    marketplaces: [ebay, mercari],
  });
  const matrixListing = await addListing({
    title: "The Matrix, DVD",
    itemId: matrix,
    quantity: 1,
    askingPriceCents: 1000,
    listedAt: "2026-11-01",
    marketplaces: [ebay, mercari],
    commissionBps: 2000,
  });
  // Costs $1.00 and eBay takes 10%, so the minimum is $1.12. Asking $0.50 is below it.
  await addListing({
    title: "The Hobbit, paperback",
    itemId: hobbit,
    quantity: 1,
    askingPriceCents: 50,
    listedAt: "2026-11-15",
    marketplaces: [ebay],
  });

  // eBay: 2000 − 200 fee − 300 shipping − 600 cost = 900 profit.
  await recordSale(db, userId, {
    listingId: duneListing,
    marketplaceId: ebay,
    soldAt: "2026-11-10",
    salePriceCents: 2000,
    shippingCostCents: 300,
    additionalFeesCents: 0,
  });
  // Mercari has no fee rule: 1600 − 600 cost = 1000 profit.
  await recordSale(db, userId, {
    listingId: duneListing,
    marketplaceId: mercari,
    soldAt: "2026-10-15",
    salePriceCents: 1600,
    shippingCostCents: 0,
    additionalFeesCents: 0,
  });
  // eBay: 1000 − 100 fee − 300 cost = 600, less 20% commission of 120 = 480 profit. The listing sells out and stays up on Mercari.
  await recordSale(db, userId, {
    listingId: matrixListing,
    marketplaceId: ebay,
    soldAt: "2026-11-20",
    salePriceCents: 1000,
    shippingCostCents: 0,
    additionalFeesCents: 0,
  });

  // Someone else's stock must never show up in the owner's numbers.
  otherUserId = await seedBase(db, "other@second-story.test");
  const otherCategory = await db
    .selectFrom("category")
    .select("id")
    .where("user_id", "=", otherUserId)
    .executeTakeFirstOrThrow();
  const otherItem = await db
    .insertInto("inventory_item")
    .values({ user_id: otherUserId, title: "Not mine", category_id: otherCategory.id, quantity_on_hand: 9 })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("purchase")
    .values({ user_id: otherUserId, item_id: otherItem.id, purchased_at: "2026-01-05", quantity: 9, unit_cost_cents: 999 })
    .execute();
});

afterAll(async () => {
  await t.close();
});

describe("month figures", () => {
  it("sums sales, revenue and profit for the month", async () => {
    expect(await loadPeriodSummary(t.db, t.userId, NOVEMBER)).toEqual({
      sales: 2,
      revenueCents: 3000,
      profitCents: 1380,
      marginBps: 4600,
    });
    expect(await loadPeriodSummary(t.db, t.userId, OCTOBER)).toEqual({
      sales: 1,
      revenueCents: 1600,
      profitCents: 1000,
      marginBps: 6250,
    });
  });

  it("returns zeros and no margin for a month with no sales", async () => {
    expect(await loadPeriodSummary(t.db, t.userId, monthRange("2026-07"))).toEqual({
      sales: 0,
      revenueCents: 0,
      profitCents: 0,
      marginBps: null,
    });
  });

  it("averages days from listed to sold", async () => {
    // Aug 5 to Nov 10 is 97 days and Nov 1 to Nov 20 is 19 days.
    expect(await loadAverageDaysToSell(t.db, t.userId, NOVEMBER)).toBe(58);
    expect(await loadAverageDaysToSell(t.db, t.userId, OCTOBER)).toBe(71);
    expect(await loadAverageDaysToSell(t.db, t.userId, monthRange("2026-07"))).toBeNull();
  });

  it("splits profit by marketplace", async () => {
    expect(await loadProfitByMarketplace(t.db, t.userId, NOVEMBER)).toMatchObject([
      { name: "eBay", sales: 2, revenueCents: 3000, profitCents: 1380 },
    ]);
    expect(await loadProfitByMarketplace(t.db, t.userId, OCTOBER)).toMatchObject([{ name: "Mercari", profitCents: 1000 }]);
  });

  it("splits profit by top-level category", async () => {
    expect(await loadProfitByCategory(t.db, t.userId, NOVEMBER)).toMatchObject([
      { name: "Book", sales: 1, profitCents: 900 },
      { name: "Movie", sales: 1, profitCents: 480 },
    ]);
  });
});

describe("today's figures", () => {
  it("counts units in stock at average cost", async () => {
    const stock = await loadStockSummary(t.db, t.userId, TODAY);
    // Dune 1 × $6.00, The Hobbit 5 × $1.00, Mystery box 2 × $0.
    expect(stock.units).toBe(8);
    expect(stock.costCents).toBe(1100);
  });

  it("ages stock from the newest purchases, and uncovered units from the oldest date", async () => {
    const stock = await loadStockSummary(t.db, t.userId, TODAY);
    expect(stock.ageBuckets).toEqual([
      // The Dune unit left is from the Nov 10 purchase. The Mystery box has no purchase and was created Nov 20.
      { key: "fresh", units: 3, costCents: 600 },
      { key: "mid", units: 0, costCents: 0 },
      // Four Hobbits bought May 1, plus the hand-corrected fifth.
      { key: "old", units: 5, costCents: 500 },
    ]);
  });

  it("moves stock into older buckets as time passes", async () => {
    const later = await loadStockSummary(t.db, t.userId, "2026-12-31");
    expect(later.ageBuckets.map((bucket) => bucket.units)).toEqual([0, 3, 5]);
  });

  it("values active listings at asking price times units left", async () => {
    // Dune has 1 of 3 left at $20.00. The Hobbit has 1 at $0.50. The Matrix listing is sold.
    expect(await loadActiveListingSummary(t.db, t.userId)).toEqual({ count: 2, askingCents: 2050 });
  });

  it("lists the latest sales first", async () => {
    const sales = await loadRecentSales(t.db, t.userId);
    expect(sales.map((sale) => [sale.soldAt, sale.listingTitle, sale.marketplaceName, sale.salePriceCents, sale.profitCents])).toEqual([
      ["2026-11-20", "The Matrix, DVD", "eBay", 1000, 480],
      ["2026-11-10", "Dune, hardcover", "eBay", 2000, 900],
      ["2026-10-15", "Dune, hardcover", "Mercari", 1600, 1000],
    ]);
    expect(await loadRecentSales(t.db, t.userId, 1)).toHaveLength(1);
  });
});

describe("needs attention", () => {
  it("counts items in stock that are in no active listing", async () => {
    // Only the Mystery box. The Matrix is sold out, and Dune and The Hobbit are listed.
    expect(await countUnlistedItems(t.db, t.userId)).toBe(1);
  });

  it("counts active listings priced below their minimum", async () => {
    expect(await countListingsBelowMinimum(t.db, t.userId)).toBe(1);
  });

  it("counts listings active for more than 60 days", async () => {
    expect(await countStaleListings(t.db, t.userId, TODAY)).toBe(1);
    // Listed Aug 5. Exactly 60 days later is not stale yet, 61 is.
    expect(await countStaleListings(t.db, t.userId, "2026-10-04")).toBe(0);
    expect(await countStaleListings(t.db, t.userId, "2026-10-05")).toBe(1);
  });

  it("counts sold listings still up on another marketplace", async () => {
    expect(await countSoldStillUp(t.db, t.userId)).toBe(1);
  });

  it("sums unpaid commission, and drops it once paid", async () => {
    expect(await loadCommissionOwedCents(t.db, t.userId)).toBe(120);
    await t.db.updateTable("sale").set({ commission_paid_at: "2026-11-22" }).where("commission_cents", ">", 0).execute();
    expect(await loadCommissionOwedCents(t.db, t.userId)).toBe(0);
    await t.db.updateTable("sale").set({ commission_paid_at: null }).where("commission_cents", ">", 0).execute();
  });
});

describe("trends", () => {
  it("fills months with no sales with zeros", async () => {
    const trend = await loadMonthlyTrend(t.db, t.userId, monthsEndingAt("2026-11", 6));
    expect(trend.map((point) => [point.key, point.profitCents, point.revenueCents])).toEqual([
      ["2026-06", 0, 0],
      ["2026-07", 0, 0],
      ["2026-08", 0, 0],
      ["2026-09", 0, 0],
      ["2026-10", 1000, 1600],
      ["2026-11", 1380, 3000],
    ]);
  });

  it("buckets weeks from Monday", async () => {
    const trend = await loadWeeklyTrend(t.db, t.userId, weeksEndingAt(TODAY, 7));
    expect(trend.map((point) => [point.key, point.profitCents])).toEqual([
      ["2026-10-12", 1000],
      ["2026-10-19", 0],
      ["2026-10-26", 0],
      ["2026-11-02", 0],
      ["2026-11-09", 900],
      ["2026-11-16", 480],
      ["2026-11-23", 0],
    ]);
  });

  it("compares spend on stock with revenue", async () => {
    const points = await loadSpendVsRevenue(t.db, t.userId, monthsEndingAt("2026-11", 4));
    expect(points).toEqual([
      { month: "2026-08", spendCents: 1000, revenueCents: 0 },
      { month: "2026-09", spendCents: 0, revenueCents: 0 },
      { month: "2026-10", spendCents: 300, revenueCents: 1600 },
      { month: "2026-11", spendCents: 800, revenueCents: 3000 },
    ]);
  });

  it("finds the first month with a purchase or sale", async () => {
    expect(await loadEarliestMonth(t.db, t.userId, "2026-11")).toBe("2026-05");
  });
});

describe("loadDashboard", () => {
  it("keeps today's figures when an earlier month is selected", async () => {
    const november = await loadDashboard(t.db, t.userId, { month: "2026-11", today: TODAY });
    const october = await loadDashboard(t.db, t.userId, { month: "2026-10", today: TODAY });
    expect(november.summary.profitCents).toBe(1380);
    expect(october.summary.profitCents).toBe(1000);
    expect(october.stock).toEqual(november.stock);
    expect(october.activeListings).toEqual(november.activeListings);
    expect(october.needsAttention).toEqual({
      unlistedItems: 1,
      listingsBelowMinimum: 1,
      staleListings: 1,
      soldStillUp: 1,
      commissionOwedCents: 120,
    });
    // An earlier month's weekly trend ends with that month's last week.
    expect(october.weeklyTrend.at(-1)?.key).toBe("2026-10-26");
    expect(november.weeklyTrend.at(-1)?.key).toBe("2026-11-23");
    expect(october.monthlyTrend.at(-1)?.key).toBe("2026-10");
  });

  it("returns an empty dashboard for a user with no data", async () => {
    const empty = await loadDashboard(t.db, otherUserId, { month: "2026-07", today: TODAY });
    expect(empty.summary).toEqual({ sales: 0, revenueCents: 0, profitCents: 0, marginBps: null });
    expect(empty.recentSales).toEqual([]);
    expect(empty.profitByMarketplace).toEqual([]);
    expect(empty.needsAttention.unlistedItems).toBe(1);
    expect(empty.stock.units).toBe(9);
  });
});

describe("recorded sales", () => {
  it("keep their figures when fee rules and purchase costs change afterwards", async () => {
    const before = {
      november: await loadPeriodSummary(t.db, t.userId, NOVEMBER),
      october: await loadPeriodSummary(t.db, t.userId, OCTOBER),
      byMarketplace: await loadProfitByMarketplace(t.db, t.userId, NOVEMBER),
      byCategory: await loadProfitByCategory(t.db, t.userId, NOVEMBER),
      recent: await loadRecentSales(t.db, t.userId),
      owed: await loadCommissionOwedCents(t.db, t.userId),
    };

    await t.db.updateTable("fee_rule").set({ percent_bps: 9000, fixed_cents: 500 }).where("user_id", "=", t.userId).execute();
    await t.db.updateTable("purchase").set({ unit_cost_cents: 99_900 }).where("user_id", "=", t.userId).execute();
    await t.db.updateTable("listing").set({ commission_bps: 5000 }).where("user_id", "=", t.userId).execute();

    expect({
      november: await loadPeriodSummary(t.db, t.userId, NOVEMBER),
      october: await loadPeriodSummary(t.db, t.userId, OCTOBER),
      byMarketplace: await loadProfitByMarketplace(t.db, t.userId, NOVEMBER),
      byCategory: await loadProfitByCategory(t.db, t.userId, NOVEMBER),
      recent: await loadRecentSales(t.db, t.userId),
      owed: await loadCommissionOwedCents(t.db, t.userId),
    }).toEqual(before);
  });
});
