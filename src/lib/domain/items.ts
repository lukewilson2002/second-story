import { averageUnitCostCents, weightedAverageUnitCostCents } from "@/lib/calc";
import type { DbOrTrx } from "@/lib/db";
import type { ItemStatus } from "@/lib/schemas";

export interface PurchaseSummary {
  /** Weighted average across every purchase: total cost ÷ total quantity. 0 if there are no purchases. */
  avgUnitCostCents: number;
  /** Units bought across every purchase. This is not the quantity on hand. */
  totalQuantity: number;
  totalCostCents: number;
  /** "YYYY-MM-DD", or null if there are no purchases. */
  firstPurchasedAt: string | null;
  lastPurchasedAt: string | null;
}

const EMPTY_SUMMARY: PurchaseSummary = {
  avgUnitCostCents: 0,
  totalQuantity: 0,
  totalCostCents: 0,
  firstPurchasedAt: null,
  lastPurchasedAt: null,
};

/** Works out an item's average unit cost and first and last purchase dates from its purchase rows. */
export function summarizePurchases(
  purchases: readonly { quantity: number; unitCostCents: number; purchasedAt: string }[],
): PurchaseSummary {
  if (purchases.length === 0) return EMPTY_SUMMARY;
  let totalQuantity = 0;
  let totalCostCents = 0;
  let first = purchases[0]?.purchasedAt ?? null;
  let last = first;
  for (const purchase of purchases) {
    totalQuantity += purchase.quantity;
    totalCostCents += purchase.quantity * purchase.unitCostCents;
    // "YYYY-MM-DD" strings sort the same as the dates they stand for.
    if (first === null || purchase.purchasedAt < first) first = purchase.purchasedAt;
    if (last === null || purchase.purchasedAt > last) last = purchase.purchasedAt;
  }
  return {
    avgUnitCostCents: weightedAverageUnitCostCents(purchases),
    totalQuantity,
    totalCostCents,
    firstPurchasedAt: first,
    lastPurchasedAt: last,
  };
}

/**
 * Loads the purchase summary for many items in one query.
 * Pass `itemIds` to limit it, or leave it out for every item the user has.
 * Items with no purchases are missing from the map. Use `purchaseSummaryFor` to read it safely.
 */
export async function loadPurchaseSummaries(
  db: DbOrTrx,
  userId: string,
  itemIds?: readonly string[],
): Promise<Map<string, PurchaseSummary>> {
  if (itemIds && itemIds.length === 0) return new Map();
  let query = db
    .selectFrom("purchase")
    .select((eb) => [
      "item_id",
      eb.fn.sum<number>("quantity").as("total_quantity"),
      eb.fn.sum<number>(eb("quantity", "*", eb.ref("unit_cost_cents"))).as("total_cost_cents"),
      eb.fn.min("purchased_at").as("first_purchased_at"),
      eb.fn.max("purchased_at").as("last_purchased_at"),
    ])
    .where("user_id", "=", userId)
    .groupBy("item_id");
  if (itemIds) query = query.where("item_id", "in", [...itemIds]);
  const rows = await query.execute();
  return new Map(
    rows.map((row) => {
      const totalQuantity = Number(row.total_quantity);
      const totalCostCents = Number(row.total_cost_cents);
      return [
        row.item_id,
        {
          avgUnitCostCents: averageUnitCostCents(totalCostCents, totalQuantity),
          totalQuantity,
          totalCostCents,
          firstPurchasedAt: row.first_purchased_at,
          lastPurchasedAt: row.last_purchased_at,
        },
      ];
    }),
  );
}

/** Reads one item's summary from the map, falling back to an empty summary. */
export function purchaseSummaryFor(
  summaries: ReadonlyMap<string, PurchaseSummary>,
  itemId: string,
): PurchaseSummary {
  return summaries.get(itemId) ?? EMPTY_SUMMARY;
}

/**
 * An item's status. It is derived, never stored.
 * If nothing is on hand, it is sold out. If it is in at least one active listing, it is listed. Otherwise it is in stock.
 * Draft, sold and ended listings do not count as listed.
 */
export function deriveItemStatus(item: { quantityOnHand: number; inActiveListing: boolean }): ItemStatus {
  if (item.quantityOnHand <= 0) return "sold_out";
  return item.inActiveListing ? "listed" : "in_stock";
}

/** The ids of the items that are in at least one active listing. Pair it with `deriveItemStatus`. */
export async function loadActivelyListedItemIds(db: DbOrTrx, userId: string): Promise<Set<string>> {
  const rows = await db
    .selectFrom("listing_item")
    .innerJoin("listing", "listing.id", "listing_item.listing_id")
    .select("listing_item.item_id")
    .distinct()
    .where("listing_item.user_id", "=", userId)
    .where("listing.status", "=", "active")
    .execute();
  return new Set(rows.map((row) => row.item_id));
}
