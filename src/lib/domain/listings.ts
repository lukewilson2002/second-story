import { minimumPriceToBreakEvenCents, saleBreakdown, type FeeTerms, type SaleBreakdown } from "@/lib/calc";
import type { DbOrTrx } from "@/lib/db";
import { loadPurchaseSummaries, purchaseSummaryFor } from "./items";

export interface ListingPricing {
  /** Asking price per unit of the listing. */
  askingPriceCents: number;
  /** Shipping the buyer pays per unit. */
  shippingChargedCents: number;
  /** What one unit should cost to ship. */
  estShippingCostCents: number;
  /** The friend's share of profit. Null means no commission. */
  commissionBps: number | null;
}

export interface ListingMarketplaceProjectionInput {
  listing: ListingPricing;
  /** The listing_marketplace price override. If null, the listing's asking price applies. */
  marketplaceAskingPriceCents: number | null;
  /** Cost of goods for one unit of the listing: each item's average unit cost × its quantity per unit. */
  unitCostCents: number;
  /** The fee rule for this marketplace. Pass NO_FEES if none is set. */
  rule: FeeTerms;
}

export interface ListingMarketplaceProjection {
  /** The price in effect on this marketplace. */
  askingPriceCents: number;
  /** Minimum item price to break even here. Null if the fee percent is 100% or more. */
  minimumPriceCents: number | null;
  /** Asking price minus minimum price. Negative when priced below the minimum. Null if there is no minimum. */
  aboveMinimumCents: number | null;
  /** True if the asking price is under the minimum, or no price can break even. */
  belowMinimum: boolean;
  /** Fee, profit before commission, commission, profit and margin if one unit sells at the asking price. */
  atAsking: SaleBreakdown;
}

/**
 * Minimum price and projected profit for one listing_marketplace row.
 * Fees differ by marketplace, so this runs once per marketplace the listing is on.
 * All figures are for one unit of the listing.
 */
export function projectListingMarketplace(input: ListingMarketplaceProjectionInput): ListingMarketplaceProjection {
  const askingPriceCents = input.marketplaceAskingPriceCents ?? input.listing.askingPriceCents;
  const minimumPriceCents = minimumPriceToBreakEvenCents({
    costOfGoodsCents: input.unitCostCents,
    shippingCostCents: input.listing.estShippingCostCents,
    shippingChargedCents: input.listing.shippingChargedCents,
    rule: input.rule,
  });
  return {
    askingPriceCents,
    minimumPriceCents,
    aboveMinimumCents: minimumPriceCents === null ? null : askingPriceCents - minimumPriceCents,
    belowMinimum: minimumPriceCents === null || askingPriceCents < minimumPriceCents,
    atAsking: saleBreakdown({
      priceCents: askingPriceCents,
      shippingChargedCents: input.listing.shippingChargedCents,
      shippingCostCents: input.listing.estShippingCostCents,
      additionalFeesCents: 0,
      costOfGoodsCents: input.unitCostCents,
      commissionBps: input.listing.commissionBps,
      rule: input.rule,
    }),
  };
}

export interface ListingItemCost {
  itemId: string;
  title: string;
  categoryId: string;
  quantityPerUnit: number;
  quantityOnHand: number;
  /** The item's weighted average unit cost today. */
  avgUnitCostCents: number;
}

export interface ListingCost {
  /** Cost of goods for one unit of the listing. */
  unitCostCents: number;
  /**
   * The category used to pick fee rules for this listing: the category of its first item.
   * Null if the listing has no items yet.
   */
  feeCategoryId: string | null;
  /** The listing's items in position order. */
  items: ListingItemCost[];
}

const EMPTY_LISTING_COST: ListingCost = { unitCostCents: 0, feeCategoryId: null, items: [] };

/**
 * Loads the cost of goods for listings, from today's average unit costs.
 * Pass `listingIds` to limit it, or leave it out for every listing the user has.
 * Listings with no items are missing from the map. Use `listingCostFor` to read it safely.
 */
export async function loadListingCosts(
  db: DbOrTrx,
  userId: string,
  listingIds?: readonly string[],
): Promise<Map<string, ListingCost>> {
  if (listingIds && listingIds.length === 0) return new Map();
  let query = db
    .selectFrom("listing_item")
    .innerJoin("inventory_item", "inventory_item.id", "listing_item.item_id")
    .select([
      "listing_item.listing_id",
      "listing_item.item_id",
      "listing_item.quantity_per_unit",
      "inventory_item.title",
      "inventory_item.category_id",
      "inventory_item.quantity_on_hand",
    ])
    .where("listing_item.user_id", "=", userId)
    .orderBy("listing_item.position")
    .orderBy("listing_item.id");
  if (listingIds) query = query.where("listing_item.listing_id", "in", [...listingIds]);
  const rows = await query.execute();
  const summaries = await loadPurchaseSummaries(db, userId, [...new Set(rows.map((row) => row.item_id))]);

  const result = new Map<string, ListingCost>();
  for (const row of rows) {
    const avgUnitCostCents = purchaseSummaryFor(summaries, row.item_id).avgUnitCostCents;
    const cost = result.get(row.listing_id) ?? { unitCostCents: 0, feeCategoryId: row.category_id, items: [] };
    cost.unitCostCents += avgUnitCostCents * row.quantity_per_unit;
    cost.items.push({
      itemId: row.item_id,
      title: row.title,
      categoryId: row.category_id,
      quantityPerUnit: row.quantity_per_unit,
      quantityOnHand: row.quantity_on_hand,
      avgUnitCostCents,
    });
    result.set(row.listing_id, cost);
  }
  return result;
}

/** Reads one listing's cost from the map, falling back to a zero cost with no items. */
export function listingCostFor(costs: ReadonlyMap<string, ListingCost>, listingId: string): ListingCost {
  return costs.get(listingId) ?? EMPTY_LISTING_COST;
}

/**
 * Units already sold per listing.
 * `listing.quantity` is the total put up for sale and never changes when a sale is recorded.
 * Units left = `listing.quantity` − the number from this map.
 */
export async function loadListingSoldQuantities(
  db: DbOrTrx,
  userId: string,
  listingIds?: readonly string[],
): Promise<Map<string, number>> {
  if (listingIds && listingIds.length === 0) return new Map();
  let query = db
    .selectFrom("sale")
    .select((eb) => ["listing_id", eb.fn.sum<number>("quantity").as("sold")])
    .where("user_id", "=", userId)
    .groupBy("listing_id");
  if (listingIds) query = query.where("listing_id", "in", [...listingIds]);
  const rows = await query.execute();
  return new Map(rows.map((row) => [row.listing_id, Number(row.sold)]));
}
