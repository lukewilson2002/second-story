import { sql } from "kysely";
import { averageUnitCostCents, divRoundHalfUp, marginBps } from "@/lib/calc";
import type { DbOrTrx } from "@/lib/db";
import {
  categoriesById,
  listingCostFor,
  loadCategories,
  loadFeeRules,
  loadListingCosts,
  projectListingMarketplace,
  resolveFeeTerms,
  saleRowProfit,
  STALE_LISTING_DAYS,
  topLevelCategoryId,
} from "@/lib/domain";
import { addDays, APP_TIME_ZONE, daysBetween, toIsoDate, type IsoDate } from "@/lib/format";
import { addMonths, monthOf, monthRange, monthsEndingAt, weeksEndingAt, type DateRange, type MonthKey } from "./month";

export const TREND_MONTHS = 6;
export const TREND_WEEKS = 12;
export const RECENT_SALES_LIMIT = 5;

/**
 * Sums of the sale columns that profit is made of, named like the columns.
 * Profit is linear in these, so the summed row goes through `saleRowProfit` and the formula stays in one place.
 * The casts keep every sum a bigint, which the drivers return as a number.
 */
const SALE_SUMS = [
  sql<number>`count(*)`.as("sales"),
  sql<number>`coalesce(sum(sale.sale_price_cents), 0)::bigint`.as("sale_price_cents"),
  sql<number>`coalesce(sum(sale.shipping_charged_cents), 0)::bigint`.as("shipping_charged_cents"),
  sql<number>`coalesce(sum(sale.shipping_cost_cents), 0)::bigint`.as("shipping_cost_cents"),
  sql<number>`coalesce(sum(sale.marketplace_fee_cents), 0)::bigint`.as("marketplace_fee_cents"),
  sql<number>`coalesce(sum(sale.additional_fees_cents), 0)::bigint`.as("additional_fees_cents"),
  sql<number>`coalesce(sum(sale.cost_of_goods_cents), 0)::bigint`.as("cost_of_goods_cents"),
  sql<number>`coalesce(sum(sale.commission_cents), 0)::bigint`.as("commission_cents"),
] as const;

interface SaleSumRow {
  sales: number;
  sale_price_cents: number;
  shipping_charged_cents: number;
  shipping_cost_cents: number;
  marketplace_fee_cents: number;
  additional_fees_cents: number;
  cost_of_goods_cents: number;
  commission_cents: number;
}

export interface SaleTotals {
  /** Number of sale rows. */
  sales: number;
  /** Item price plus shipping charged. */
  revenueCents: number;
  /** After fees, shipping, cost of goods and commission. */
  profitCents: number;
}

function toTotals(row: SaleSumRow): SaleTotals {
  const profit = saleRowProfit({
    sale_price_cents: Number(row.sale_price_cents),
    shipping_charged_cents: Number(row.shipping_charged_cents),
    shipping_cost_cents: Number(row.shipping_cost_cents),
    marketplace_fee_cents: Number(row.marketplace_fee_cents),
    additional_fees_cents: Number(row.additional_fees_cents),
    cost_of_goods_cents: Number(row.cost_of_goods_cents),
    commission_cents: Number(row.commission_cents),
  });
  return { sales: Number(row.sales), revenueCents: profit.revenueCents, profitCents: profit.profitCents };
}

const NO_SALES: SaleTotals = { sales: 0, revenueCents: 0, profitCents: 0 };

export interface PeriodSummary extends SaleTotals {
  /** Profit over revenue. Null if there is no revenue. */
  marginBps: number | null;
}

/** Sales, revenue, profit and margin for sales dated inside the range. */
export async function loadPeriodSummary(db: DbOrTrx, userId: string, range: DateRange): Promise<PeriodSummary> {
  const row = await db
    .selectFrom("sale")
    .select(SALE_SUMS)
    .where("sale.user_id", "=", userId)
    .where("sale.sold_at", ">=", range.start)
    .where("sale.sold_at", "<", range.endExclusive)
    .executeTakeFirstOrThrow();
  const totals = toTotals(row);
  return { ...totals, marginBps: marginBps(totals.profitCents, totals.revenueCents) };
}

/**
 * Average whole days from a listing going up to each of its sales, for sales dated inside the range.
 * Each sale row counts once. Listings with no listed date are left out.
 * Returns null if there is nothing to average.
 */
export async function loadAverageDaysToSell(db: DbOrTrx, userId: string, range: DateRange): Promise<number | null> {
  const row = await db
    .selectFrom("sale")
    .innerJoin("listing", "listing.id", "sale.listing_id")
    .select([
      sql<number>`count(*)`.as("sales"),
      // `listed_at` is a timestamp and `sold_at` a date, so the timestamp is read as a date in the app time zone first.
      // A sale backdated to before the listing went up counts as 0 days.
      sql<number>`coalesce(sum(greatest(sale.sold_at - (listing.listed_at at time zone ${APP_TIME_ZONE})::date, 0)), 0)::bigint`.as(
        "days",
      ),
    ])
    .where("sale.user_id", "=", userId)
    .where("listing.listed_at", "is not", null)
    .where("sale.sold_at", ">=", range.start)
    .where("sale.sold_at", "<", range.endExclusive)
    .executeTakeFirstOrThrow();
  const sales = Number(row.sales);
  return sales === 0 ? null : divRoundHalfUp(Number(row.days), sales);
}

interface StockItem {
  id: string;
  quantityOnHand: number;
  avgUnitCostCents: number;
  /** The date uncovered units are aged from: the first purchase, or the day the item was created if it has none. */
  oldestDate: IsoDate;
}

/** Every item with units on hand, with its average unit cost across all its purchases. */
async function loadStockItems(db: DbOrTrx, userId: string): Promise<StockItem[]> {
  const rows = await db
    .selectFrom("inventory_item")
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("purchase")
          .select((e) => [
            "purchase.item_id",
            e.fn.sum<number>("purchase.quantity").as("total_quantity"),
            e.fn.sum<number>(e("purchase.quantity", "*", e.ref("purchase.unit_cost_cents"))).as("total_cost_cents"),
            e.fn.min("purchase.purchased_at").as("first_purchased_at"),
          ])
          .where("purchase.user_id", "=", userId)
          .groupBy("purchase.item_id")
          .as("bought"),
      (join) => join.onRef("bought.item_id", "=", "inventory_item.id"),
    )
    .select([
      "inventory_item.id",
      "inventory_item.quantity_on_hand",
      "inventory_item.created_at",
      "bought.total_quantity",
      "bought.total_cost_cents",
      "bought.first_purchased_at",
    ])
    .where("inventory_item.user_id", "=", userId)
    .where("inventory_item.quantity_on_hand", ">", 0)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    quantityOnHand: row.quantity_on_hand,
    avgUnitCostCents: averageUnitCostCents(Number(row.total_cost_cents ?? 0), Number(row.total_quantity ?? 0)),
    oldestDate: row.first_purchased_at ?? toIsoDate(row.created_at),
  }));
}

export type AgeBucketKey = "fresh" | "mid" | "old";

export interface AgeBucket {
  key: AgeBucketKey;
  units: number;
  /** Units times each item's average unit cost. */
  costCents: number;
}

export interface StockSummary {
  /** Units on hand across every item. */
  units: number;
  /** Each item's units on hand times its average unit cost. */
  costCents: number;
  /** Always three buckets, in order: 0 to 30 days, 31 to 90 days, over 90 days. */
  ageBuckets: AgeBucket[];
}

function ageBucketFor(days: number): AgeBucketKey {
  if (days <= 30) return "fresh";
  return days <= 90 ? "mid" : "old";
}

/**
 * Units in stock today, what they cost, and how long they have been held.
 *
 * Age assumes the oldest units sell first, so the units on hand are the most recently bought ones.
 * The query walks each item's purchases from newest to oldest and takes units until the quantity on hand is covered.
 * If the quantity on hand is more than was ever purchased (a hand correction), the extra units take the age of the item's first purchase.
 */
export async function loadStockSummary(db: DbOrTrx, userId: string, today: IsoDate): Promise<StockSummary> {
  const items = await loadStockItems(db, userId);
  const lots = await sql<{ item_id: string; bucket: AgeBucketKey; units: number }>`
    with lot as (
      select
        purchase.item_id,
        purchase.purchased_at,
        purchase.quantity,
        inventory_item.quantity_on_hand,
        sum(purchase.quantity) over (
          partition by purchase.item_id
          order by purchase.purchased_at desc, purchase.created_at desc, purchase.id desc
        ) as running
      from purchase
      inner join inventory_item on inventory_item.id = purchase.item_id
      where purchase.user_id = ${userId}
        and inventory_item.user_id = ${userId}
        and inventory_item.quantity_on_hand > 0
    )
    select
      item_id,
      case
        when ${today}::date - purchased_at <= 30 then 'fresh'
        when ${today}::date - purchased_at <= 90 then 'mid'
        else 'old'
      end as bucket,
      sum(greatest(least(quantity, quantity_on_hand - (running - quantity)), 0))::bigint as units
    from lot
    group by 1, 2
  `.execute(db);

  const buckets: Record<AgeBucketKey, AgeBucket> = {
    fresh: { key: "fresh", units: 0, costCents: 0 },
    mid: { key: "mid", units: 0, costCents: 0 },
    old: { key: "old", units: 0, costCents: 0 },
  };
  const byId = new Map(items.map((item) => [item.id, item]));
  const covered = new Map<string, number>();
  const add = (key: AgeBucketKey, item: StockItem, units: number) => {
    buckets[key].units += units;
    buckets[key].costCents += units * item.avgUnitCostCents;
  };
  for (const lot of lots.rows) {
    const item = byId.get(lot.item_id);
    const units = Number(lot.units);
    if (!item || units <= 0) continue;
    add(lot.bucket, item, units);
    covered.set(item.id, (covered.get(item.id) ?? 0) + units);
  }

  let units = 0;
  let costCents = 0;
  for (const item of items) {
    units += item.quantityOnHand;
    costCents += item.quantityOnHand * item.avgUnitCostCents;
    const uncovered = item.quantityOnHand - (covered.get(item.id) ?? 0);
    if (uncovered > 0) add(ageBucketFor(daysBetween(item.oldestDate, today) ?? 0), item, uncovered);
  }
  return { units, costCents, ageBuckets: [buckets.fresh, buckets.mid, buckets.old] };
}

export interface ActiveListingSummary {
  /** Listings with status `active`. */
  count: number;
  /** Asking price times the units not yet sold, summed over active listings. */
  askingCents: number;
}

/** How many listings are active today and what their unsold units are priced at. */
export async function loadActiveListingSummary(db: DbOrTrx, userId: string): Promise<ActiveListingSummary> {
  const row = await db
    .selectFrom("listing")
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("sale")
          .select((e) => ["sale.listing_id", e.fn.sum<number>("sale.quantity").as("sold")])
          .where("sale.user_id", "=", userId)
          .groupBy("sale.listing_id")
          .as("sold"),
      (join) => join.onRef("sold.listing_id", "=", "listing.id"),
    )
    .select([
      sql<number>`count(*)`.as("count"),
      // `listing.quantity` is the total put up for sale, so the units left are that minus what has sold.
      sql<number>`coalesce(sum(listing.asking_price_cents * greatest(listing.quantity - coalesce(sold.sold, 0), 0)), 0)::bigint`.as(
        "asking_cents",
      ),
    ])
    .where("listing.user_id", "=", userId)
    .where("listing.status", "=", "active")
    .executeTakeFirstOrThrow();
  return { count: Number(row.count), askingCents: Number(row.asking_cents) };
}

export interface TrendPoint {
  /** "YYYY-MM" for a month, or the Monday's "YYYY-MM-DD" for a week. */
  key: string;
  sales: number;
  revenueCents: number;
  profitCents: number;
}

async function loadSaleBuckets(
  db: DbOrTrx,
  userId: string,
  bucket: ReturnType<typeof sql<string>>,
  range: DateRange,
): Promise<Map<string, SaleTotals>> {
  const rows = await db
    .selectFrom("sale")
    .select([bucket.as("bucket"), ...SALE_SUMS])
    .where("sale.user_id", "=", userId)
    .where("sale.sold_at", ">=", range.start)
    .where("sale.sold_at", "<", range.endExclusive)
    .groupBy(bucket)
    .execute();
  return new Map(rows.map((row) => [row.bucket, toTotals(row)]));
}

const SALE_MONTH = sql<string>`to_char(sale.sold_at, 'YYYY-MM')`;
// Subtracting the ISO weekday (Monday is 1) lands on the Monday of the week, and stays a date with no time zone involved.
const SALE_WEEK = sql<string>`to_char(sale.sold_at - (extract(isodow from sale.sold_at)::int - 1), 'YYYY-MM-DD')`;

/** Sales, revenue and profit for each of the months given, in the same order. Months with no sales are zero. */
export async function loadMonthlyTrend(db: DbOrTrx, userId: string, months: readonly MonthKey[]): Promise<TrendPoint[]> {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return [];
  const totals = await loadSaleBuckets(db, userId, SALE_MONTH, {
    start: `${first}-01`,
    endExclusive: `${addMonths(last, 1)}-01`,
  });
  return months.map((key) => ({ key, ...(totals.get(key) ?? NO_SALES) }));
}

/** Sales, revenue and profit for each of the weeks given by their Mondays, in the same order. Weeks with no sales are zero. */
export async function loadWeeklyTrend(db: DbOrTrx, userId: string, weekStarts: readonly IsoDate[]): Promise<TrendPoint[]> {
  const first = weekStarts[0];
  const last = weekStarts[weekStarts.length - 1];
  if (first === undefined || last === undefined) return [];
  const totals = await loadSaleBuckets(db, userId, SALE_WEEK, { start: first, endExclusive: addDays(last, 7) });
  return weekStarts.map((key) => ({ key, ...(totals.get(key) ?? NO_SALES) }));
}

export interface SpendPoint {
  month: MonthKey;
  /** Quantity times unit cost for purchases dated in the month. */
  spendCents: number;
  revenueCents: number;
}

/** What was spent on stock and what sales brought in, for each of the months given. */
export async function loadSpendVsRevenue(db: DbOrTrx, userId: string, months: readonly MonthKey[]): Promise<SpendPoint[]> {
  const first = months[0];
  const last = months[months.length - 1];
  if (first === undefined || last === undefined) return [];
  const bucket = sql<string>`to_char(purchase.purchased_at, 'YYYY-MM')`;
  const spendRows = await db
    .selectFrom("purchase")
    .select([bucket.as("bucket"), sql<number>`sum(purchase.quantity * purchase.unit_cost_cents)::bigint`.as("spend_cents")])
    .where("purchase.user_id", "=", userId)
    .where("purchase.purchased_at", ">=", `${first}-01`)
    .where("purchase.purchased_at", "<", `${addMonths(last, 1)}-01`)
    .groupBy(bucket)
    .execute();
  const spend = new Map(spendRows.map((row) => [row.bucket, Number(row.spend_cents)]));
  const revenue = await loadMonthlyTrend(db, userId, months);
  return revenue.map((point) => ({
    month: point.key,
    spendCents: spend.get(point.key) ?? 0,
    revenueCents: point.revenueCents,
  }));
}

export interface ProfitSlice extends SaleTotals {
  /** A marketplace or category id. Null for sales whose listing has no items, so no category. */
  id: string | null;
  name: string;
}

function byProfitThenName(a: ProfitSlice, b: ProfitSlice): number {
  return b.profitCents - a.profitCents || a.name.localeCompare(b.name);
}

/** Profit for each marketplace that had a sale dated inside the range, highest first. */
export async function loadProfitByMarketplace(db: DbOrTrx, userId: string, range: DateRange): Promise<ProfitSlice[]> {
  const rows = await db
    .selectFrom("sale")
    .innerJoin("marketplace", "marketplace.id", "sale.marketplace_id")
    .select(["marketplace.id", "marketplace.name", ...SALE_SUMS])
    .where("sale.user_id", "=", userId)
    .where("sale.sold_at", ">=", range.start)
    .where("sale.sold_at", "<", range.endExclusive)
    .groupBy(["marketplace.id", "marketplace.name"])
    .execute();
  return rows.map((row) => ({ id: row.id, name: row.name, ...toTotals(row) })).sort(byProfitThenName);
}

/**
 * Profit for each top-level category that had a sale dated inside the range, highest first.
 * A sale belongs to the category of its listing's first item, the same category that picks the listing's fee rule.
 * Subcategories are rolled up, so a DVD sale counts under Movie.
 */
export async function loadProfitByCategory(db: DbOrTrx, userId: string, range: DateRange): Promise<ProfitSlice[]> {
  const rows = await db
    .selectFrom("sale")
    .leftJoin(
      (eb) =>
        eb
          .selectFrom("listing_item")
          .innerJoin("inventory_item", "inventory_item.id", "listing_item.item_id")
          .select(["listing_item.listing_id", "inventory_item.category_id"])
          .distinctOn("listing_item.listing_id")
          .where("listing_item.user_id", "=", userId)
          .orderBy("listing_item.listing_id")
          .orderBy("listing_item.position")
          .orderBy("listing_item.id")
          .as("first_item"),
      (join) => join.onRef("first_item.listing_id", "=", "sale.listing_id"),
    )
    .select(["first_item.category_id", ...SALE_SUMS])
    .where("sale.user_id", "=", userId)
    .where("sale.sold_at", ">=", range.start)
    .where("sale.sold_at", "<", range.endExclusive)
    .groupBy("first_item.category_id")
    .execute();

  const categories = categoriesById(await loadCategories(db, userId));
  const slices = new Map<string | null, ProfitSlice>();
  for (const row of rows) {
    const id = row.category_id === null ? null : topLevelCategoryId(row.category_id, categories);
    const totals = toTotals(row);
    const slice = slices.get(id) ?? {
      id,
      name: id === null ? "No category" : (categories.get(id)?.name ?? "No category"),
      ...NO_SALES,
    };
    slices.set(id, {
      ...slice,
      sales: slice.sales + totals.sales,
      revenueCents: slice.revenueCents + totals.revenueCents,
      profitCents: slice.profitCents + totals.profitCents,
    });
  }
  return [...slices.values()].sort(byProfitThenName);
}

/** Items with units on hand that are in no active listing. Matches item status "in stock". */
export async function countUnlistedItems(db: DbOrTrx, userId: string): Promise<number> {
  const row = await db
    .selectFrom("inventory_item")
    .select(sql<number>`count(*)`.as("count"))
    .where("inventory_item.user_id", "=", userId)
    .where("inventory_item.quantity_on_hand", ">", 0)
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("listing_item")
            .innerJoin("listing", "listing.id", "listing_item.listing_id")
            .select("listing_item.id")
            .whereRef("listing_item.item_id", "=", "inventory_item.id")
            .where("listing.status", "=", "active"),
        ),
      ),
    )
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/**
 * Active listings whose asking price is under the break-even minimum on at least one marketplace they are still up on.
 * The minimum comes from `projectListingMarketplace`, the same helper the listing form uses.
 */
export async function countListingsBelowMinimum(db: DbOrTrx, userId: string): Promise<number> {
  const rows = await db
    .selectFrom("listing")
    .innerJoin("listing_marketplace", "listing_marketplace.listing_id", "listing.id")
    .select([
      "listing.id",
      "listing.asking_price_cents",
      "listing.shipping_charged_cents",
      "listing.est_shipping_cost_cents",
      "listing.commission_bps",
      "listing_marketplace.marketplace_id",
      "listing_marketplace.asking_price_cents as marketplace_asking_price_cents",
    ])
    .where("listing.user_id", "=", userId)
    .where("listing.status", "=", "active")
    .where("listing_marketplace.status", "=", "active")
    .execute();
  if (rows.length === 0) return 0;

  const listingIds = [...new Set(rows.map((row) => row.id))];
  const costs = await loadListingCosts(db, userId, listingIds);
  const rules = await loadFeeRules(db, userId);
  const categories = categoriesById(await loadCategories(db, userId));

  const below = new Set<string>();
  for (const row of rows) {
    if (below.has(row.id)) continue;
    const cost = listingCostFor(costs, row.id);
    const projection = projectListingMarketplace({
      listing: {
        askingPriceCents: row.asking_price_cents,
        shippingChargedCents: row.shipping_charged_cents,
        estShippingCostCents: row.est_shipping_cost_cents,
        commissionBps: row.commission_bps,
      },
      marketplaceAskingPriceCents: row.marketplace_asking_price_cents,
      unitCostCents: cost.unitCostCents,
      rule: resolveFeeTerms(rules, row.marketplace_id, cost.feeCategoryId, categories),
    });
    if (projection.belowMinimum) below.add(row.id);
  }
  return below.size;
}

/** Active listings that went up more than `STALE_LISTING_DAYS` days before `today`. */
export async function countStaleListings(db: DbOrTrx, userId: string, today: IsoDate): Promise<number> {
  const row = await db
    .selectFrom("listing")
    .select(sql<number>`count(*)`.as("count"))
    .where("listing.user_id", "=", userId)
    .where("listing.status", "=", "active")
    .where(
      sql<boolean>`(listing.listed_at at time zone ${APP_TIME_ZONE})::date < ${addDays(today, -STALE_LISTING_DAYS)}::date`,
    )
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** Sold listings that are still marked active on another marketplace and need taking down there. */
export async function countSoldStillUp(db: DbOrTrx, userId: string): Promise<number> {
  const row = await db
    .selectFrom("listing")
    .select(sql<number>`count(*)`.as("count"))
    .where("listing.user_id", "=", userId)
    .where("listing.status", "=", "sold")
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("listing_marketplace")
          .select("listing_marketplace.id")
          .whereRef("listing_marketplace.listing_id", "=", "listing.id")
          .where("listing_marketplace.status", "=", "active"),
      ),
    )
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** Commission on sales that has no paid date yet. */
export async function loadCommissionOwedCents(db: DbOrTrx, userId: string): Promise<number> {
  const row = await db
    .selectFrom("sale")
    .select(sql<number>`coalesce(sum(sale.commission_cents), 0)::bigint`.as("owed_cents"))
    .where("sale.user_id", "=", userId)
    .where("sale.commission_paid_at", "is", null)
    .executeTakeFirstOrThrow();
  return Number(row.owed_cents);
}

export interface NeedsAttention {
  unlistedItems: number;
  listingsBelowMinimum: number;
  staleListings: number;
  soldStillUp: number;
  commissionOwedCents: number;
}

export async function loadNeedsAttention(db: DbOrTrx, userId: string, today: IsoDate): Promise<NeedsAttention> {
  return {
    unlistedItems: await countUnlistedItems(db, userId),
    listingsBelowMinimum: await countListingsBelowMinimum(db, userId),
    staleListings: await countStaleListings(db, userId, today),
    soldStillUp: await countSoldStillUp(db, userId),
    commissionOwedCents: await loadCommissionOwedCents(db, userId),
  };
}

export interface RecentSale {
  id: string;
  soldAt: IsoDate;
  listingTitle: string;
  marketplaceName: string;
  /** Item price for the whole sale, without shipping. */
  salePriceCents: number;
  profitCents: number;
}

/** The latest sales, newest first. */
export async function loadRecentSales(db: DbOrTrx, userId: string, limit = RECENT_SALES_LIMIT): Promise<RecentSale[]> {
  const rows = await db
    .selectFrom("sale")
    .innerJoin("listing", "listing.id", "sale.listing_id")
    .innerJoin("marketplace", "marketplace.id", "sale.marketplace_id")
    .select([
      "sale.id",
      "sale.sold_at",
      "sale.sale_price_cents",
      "sale.shipping_charged_cents",
      "sale.shipping_cost_cents",
      "sale.marketplace_fee_cents",
      "sale.additional_fees_cents",
      "sale.cost_of_goods_cents",
      "sale.commission_cents",
      "listing.title",
      "marketplace.name as marketplace_name",
    ])
    .where("sale.user_id", "=", userId)
    .orderBy("sale.sold_at", "desc")
    .orderBy("sale.created_at", "desc")
    .orderBy("sale.id")
    .limit(limit)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    soldAt: row.sold_at,
    listingTitle: row.title,
    marketplaceName: row.marketplace_name,
    salePriceCents: row.sale_price_cents,
    profitCents: saleRowProfit(row).profitCents,
  }));
}

/** The month of the first purchase or sale on record. Falls back to `fallback` when there is neither. */
export async function loadEarliestMonth(db: DbOrTrx, userId: string, fallback: MonthKey): Promise<MonthKey> {
  const sale = await db
    .selectFrom("sale")
    .select((eb) => eb.fn.min("sale.sold_at").as("first"))
    .where("sale.user_id", "=", userId)
    .executeTakeFirst();
  const purchase = await db
    .selectFrom("purchase")
    .select((eb) => eb.fn.min("purchase.purchased_at").as("first"))
    .where("purchase.user_id", "=", userId)
    .executeTakeFirst();
  const months = [sale?.first, purchase?.first, `${fallback}-01`]
    .filter((date): date is string => typeof date === "string")
    .map(monthOf)
    .sort();
  return months[0] ?? fallback;
}

export interface DashboardData {
  month: MonthKey;
  summary: PeriodSummary;
  averageDaysToSell: number | null;
  stock: StockSummary;
  activeListings: ActiveListingSummary;
  monthlyTrend: TrendPoint[];
  weeklyTrend: TrendPoint[];
  spendVsRevenue: SpendPoint[];
  profitByMarketplace: ProfitSlice[];
  profitByCategory: ProfitSlice[];
  needsAttention: NeedsAttention;
  recentSales: RecentSale[];
}

/**
 * Everything the dashboard shows.
 * Profit, sales, average days to sell and the two breakdowns are for `month`.
 * The trends end at `month`. If `month` is the current month, the weekly trend ends at this week, otherwise at the month's last week.
 * Stock, active listings, needs attention and recent sales are always today's figures.
 */
export async function loadDashboard(
  db: DbOrTrx,
  userId: string,
  { month, today }: { month: MonthKey; today: IsoDate },
): Promise<DashboardData> {
  const range = monthRange(month);
  const months = monthsEndingAt(month, TREND_MONTHS);
  const lastDay = month === monthOf(today) ? today : addDays(range.endExclusive, -1);
  const [
    summary,
    averageDaysToSell,
    stock,
    activeListings,
    monthlyTrend,
    weeklyTrend,
    spendVsRevenue,
    profitByMarketplace,
    profitByCategory,
    needsAttention,
    recentSales,
  ] = await Promise.all([
    loadPeriodSummary(db, userId, range),
    loadAverageDaysToSell(db, userId, range),
    loadStockSummary(db, userId, today),
    loadActiveListingSummary(db, userId),
    loadMonthlyTrend(db, userId, months),
    loadWeeklyTrend(db, userId, weeksEndingAt(lastDay, TREND_WEEKS)),
    loadSpendVsRevenue(db, userId, months),
    loadProfitByMarketplace(db, userId, range),
    loadProfitByCategory(db, userId, range),
    loadNeedsAttention(db, userId, today),
    loadRecentSales(db, userId),
  ]);
  return {
    month,
    summary,
    averageDaysToSell,
    stock,
    activeListings,
    monthlyTrend,
    weeklyTrend,
    spendVsRevenue,
    profitByMarketplace,
    profitByCategory,
    needsAttention,
    recentSales,
  };
}
