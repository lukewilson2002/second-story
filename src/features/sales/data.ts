import "server-only";

import { marginBps } from "@/lib/calc";
import type { DbOrTrx } from "@/lib/db";
import {
  categoriesById,
  DomainError,
  listingCostFor,
  loadCategories,
  loadFeeRules,
  loadListingCosts,
  loadListingSoldQuantities,
  resolveFeeTerms,
  saleRowProfit,
} from "@/lib/domain";
import type { SaleRow, SellableListing } from "./types";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}

/**
 * The listings that can be marked sold: active, with units left, and still up on at least one marketplace.
 * Each one carries only the marketplaces it is still up on, because `recordSale` does not check a marketplace row's status.
 */
export async function loadSellableListings(db: DbOrTrx, userId: string): Promise<SellableListing[]> {
  const listings = await db
    .selectFrom("listing")
    .select(["id", "title", "quantity", "asking_price_cents", "shipping_charged_cents", "commission_bps"])
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .orderBy("id")
    .execute();
  if (listings.length === 0) return [];
  const listingIds = listings.map((listing) => listing.id);

  const [rows, costs, sold, rules, categories] = await Promise.all([
    db
      .selectFrom("listing_marketplace")
      .innerJoin("marketplace", "marketplace.id", "listing_marketplace.marketplace_id")
      .select([
        "listing_marketplace.listing_id",
        "listing_marketplace.marketplace_id",
        "listing_marketplace.asking_price_cents",
        "marketplace.name",
      ])
      .where("listing_marketplace.user_id", "=", userId)
      .where("listing_marketplace.status", "=", "active")
      .where("listing_marketplace.listing_id", "in", listingIds)
      .execute(),
    loadListingCosts(db, userId, listingIds),
    loadListingSoldQuantities(db, userId, listingIds),
    loadFeeRules(db, userId),
    loadCategories(db, userId),
  ]);
  const byId = categoriesById(categories);
  // Sorted here, not in SQL: the local database and Neon order mixed-case names ("eBay", "Mercari") differently.
  rows.sort((a, b) => compareText(a.name, b.name));
  listings.sort((a, b) => compareText(a.title, b.title));

  const result: SellableListing[] = [];
  for (const listing of listings) {
    const quantityLeft = listing.quantity - (sold.get(listing.id) ?? 0);
    const cost = listingCostFor(costs, listing.id);
    const marketplaces = rows
      .filter((row) => row.listing_id === listing.id)
      .map((row) => ({
        marketplaceId: row.marketplace_id,
        name: row.name,
        askingPriceCents: row.asking_price_cents ?? listing.asking_price_cents,
        rule: resolveFeeTerms(rules, row.marketplace_id, cost.feeCategoryId, byId),
      }));
    if (quantityLeft <= 0 || marketplaces.length === 0) continue;
    result.push({
      id: listing.id,
      title: listing.title,
      quantityLeft,
      shippingChargedCents: listing.shipping_charged_cents,
      commissionBps: listing.commission_bps,
      unitCostCents: cost.unitCostCents,
      marketplaces,
    });
  }
  return result;
}

/** Every sale, newest first, with profit and margin worked out from the values snapshotted on the sale row. */
export async function loadSaleRows(db: DbOrTrx, userId: string): Promise<SaleRow[]> {
  const rows = await db
    .selectFrom("sale")
    .innerJoin("listing", "listing.id", "sale.listing_id")
    .innerJoin("marketplace", "marketplace.id", "sale.marketplace_id")
    .select([
      "sale.id",
      "sale.sold_at",
      "sale.listing_id",
      "sale.quantity",
      "sale.sale_price_cents",
      "sale.shipping_charged_cents",
      "sale.shipping_cost_cents",
      "sale.marketplace_fee_cents",
      "sale.additional_fees_cents",
      "sale.cost_of_goods_cents",
      "sale.commission_cents",
      "sale.commission_paid_at",
      "listing.title",
      "listing.commission_payee",
      "marketplace.name",
    ])
    .where("sale.user_id", "=", userId)
    .orderBy("sale.sold_at", "desc")
    .orderBy("sale.created_at", "desc")
    .orderBy("sale.id")
    .execute();

  return rows.map((row) => {
    const profit = saleRowProfit(row);
    return {
      id: row.id,
      soldAt: row.sold_at,
      listingId: row.listing_id,
      listingTitle: row.title,
      marketplaceName: row.name,
      quantity: row.quantity,
      salePriceCents: row.sale_price_cents,
      shippingChargedCents: row.shipping_charged_cents,
      shippingCostCents: row.shipping_cost_cents,
      marketplaceFeeCents: row.marketplace_fee_cents,
      additionalFeesCents: row.additional_fees_cents,
      costOfGoodsCents: row.cost_of_goods_cents,
      commissionCents: row.commission_cents,
      commissionPayee: row.commission_payee,
      commissionPaidAt: row.commission_paid_at,
      revenueCents: profit.revenueCents,
      profitBeforeCommissionCents: profit.profitBeforeCommissionCents,
      profitCents: profit.profitCents,
      marginBps: marginBps(profit.profitCents, profit.revenueCents),
    };
  });
}

/**
 * Records that the commission on one sale was paid on `paidAt`, or pass null to mark it owed again.
 * Throws a DomainError if the sale does not exist or carries no commission.
 */
export async function setCommissionPaid(
  db: DbOrTrx,
  userId: string,
  saleId: string,
  paidAt: string | null,
): Promise<void> {
  const updated = await db
    .updateTable("sale")
    .set({ commission_paid_at: paidAt })
    .where("id", "=", saleId)
    .where("user_id", "=", userId)
    .where("commission_cents", ">", 0)
    .returning("id")
    .execute();
  if (updated.length === 0) throw new DomainError("not_found", "That sale has no commission to mark.");
}

/** Marks every sale with unpaid commission as paid on `paidAt`. Returns how many sales changed. */
export async function markAllCommissionPaid(db: DbOrTrx, userId: string, paidAt: string): Promise<number> {
  const updated = await db
    .updateTable("sale")
    .set({ commission_paid_at: paidAt })
    .where("user_id", "=", userId)
    .where("commission_cents", ">", 0)
    .where("commission_paid_at", "is", null)
    .returning("id")
    .execute();
  return updated.length;
}

/** Commission still owed: the total and the number of sales it is spread over. */
export function commissionOwed(rows: readonly SaleRow[]): { totalCents: number; count: number } {
  const owed = rows.filter((row) => row.commissionCents > 0 && row.commissionPaidAt === null);
  return { totalCents: owed.reduce((sum, row) => sum + row.commissionCents, 0), count: owed.length };
}
