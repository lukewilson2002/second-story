import { saleBreakdown, type SaleBreakdown } from "@/lib/calc";
import type { Db, DbOrTrx } from "@/lib/db";
import { recordSaleInputSchema, type RecordSaleInput } from "@/lib/schemas";
import { categoriesById, loadCategories } from "./categories";
import { DomainError } from "./errors";
import { loadFeeRules, resolveFeeTerms } from "./fees";
import { loadListingCosts, listingCostFor, loadListingSoldQuantities, type ListingItemCost } from "./listings";

export interface SalePreview {
  listingId: string;
  marketplaceId: string;
  quantity: number;
  /** Units of the listing still unsold before this sale. */
  remainingBefore: number;
  salePriceCents: number;
  shippingChargedCents: number;
  shippingCostCents: number;
  additionalFeesCents: number;
  /** Snapshot: each item's average unit cost × quantity per unit × units sold. */
  costOfGoodsCents: number;
  /** From the fee rule, or the override if one was passed. */
  marketplaceFeeCents: number;
  /** What the fee rule alone gives, ignoring any override. Use it to prefill the fee field. */
  ruleFeeCents: number;
  commissionBps: number | null;
  breakdown: SaleBreakdown;
  items: ListingItemCost[];
}

export interface RecordedSale extends SalePreview {
  saleId: string;
  /** True if this sale used up the listing's quantity, so the listing is now `sold`. */
  listingSoldOut: boolean;
  /** Other marketplaces where the sold-out listing is still marked active. The dashboard flags these as "take this down". */
  stillActiveOnMarketplaceIds: string[];
}

async function computeSale(
  db: DbOrTrx,
  userId: string,
  rawInput: RecordSaleInput,
  lock: boolean,
): Promise<SalePreview> {
  const parsed = recordSaleInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new DomainError("invalid", parsed.error.issues[0]?.message ?? "The sale details are not valid.");
  }
  const input = parsed.data;

  let listingQuery = db
    .selectFrom("listing")
    .select(["id", "status", "quantity", "shipping_charged_cents", "commission_bps"])
    .where("id", "=", input.listingId)
    .where("user_id", "=", userId);
  // The row lock makes two sales of the same listing run one after the other, so they cannot both take the last unit.
  if (lock) listingQuery = listingQuery.forUpdate();
  const listing = await listingQuery.executeTakeFirst();
  if (!listing) throw new DomainError("not_found", "That listing does not exist.");
  if (listing.status !== "active") {
    throw new DomainError("listing_not_active", "Only an active listing can be marked sold.");
  }

  const onMarketplace = await db
    .selectFrom("listing_marketplace")
    .select("id")
    .where("listing_id", "=", listing.id)
    .where("marketplace_id", "=", input.marketplaceId)
    .where("user_id", "=", userId)
    .where("status", "=", "active")
    .executeTakeFirst();
  if (!onMarketplace) {
    throw new DomainError("not_on_marketplace", "This listing is not up on that marketplace.");
  }

  const sold = (await loadListingSoldQuantities(db, userId, [listing.id])).get(listing.id) ?? 0;
  const remainingBefore = listing.quantity - sold;
  if (input.quantity > remainingBefore) {
    throw new DomainError(
      "not_enough_listing_quantity",
      remainingBefore === 1
        ? "This listing has 1 unit left."
        : `This listing has ${remainingBefore} units left.`,
    );
  }

  const cost = listingCostFor(await loadListingCosts(db, userId, [listing.id]), listing.id);
  for (const item of cost.items) {
    if (item.quantityOnHand < item.quantityPerUnit * input.quantity) {
      throw new DomainError(
        "not_enough_stock",
        `Not enough stock of "${item.title}": ${item.quantityOnHand} on hand, ${item.quantityPerUnit * input.quantity} needed.`,
      );
    }
  }

  const [rules, categories] = await Promise.all([loadFeeRules(db, userId), loadCategories(db, userId)]);
  const rule = resolveFeeTerms(rules, input.marketplaceId, cost.feeCategoryId, categoriesById(categories));

  const shippingChargedCents = input.shippingChargedCents ?? listing.shipping_charged_cents * input.quantity;
  const costOfGoodsCents = cost.unitCostCents * input.quantity;
  const amounts = {
    priceCents: input.salePriceCents,
    shippingChargedCents,
    shippingCostCents: input.shippingCostCents,
    additionalFeesCents: input.additionalFeesCents,
    costOfGoodsCents,
    commissionBps: listing.commission_bps,
    rule,
  };
  const ruleFeeCents = saleBreakdown(amounts).marketplaceFeeCents;
  const breakdown = saleBreakdown({ ...amounts, marketplaceFeeOverrideCents: input.marketplaceFeeCents });

  return {
    listingId: listing.id,
    marketplaceId: input.marketplaceId,
    quantity: input.quantity,
    remainingBefore,
    salePriceCents: input.salePriceCents,
    shippingChargedCents,
    shippingCostCents: input.shippingCostCents,
    additionalFeesCents: input.additionalFeesCents,
    costOfGoodsCents,
    marketplaceFeeCents: breakdown.marketplaceFeeCents,
    ruleFeeCents,
    commissionBps: listing.commission_bps,
    breakdown,
    items: cost.items,
  };
}

/**
 * Works out what `recordSale` would store, without writing anything.
 * Use it to prefill the marketplace fee and show the profit on the mark-sold form.
 * Throws a DomainError for the same problems `recordSale` would reject.
 */
export async function previewSale(db: DbOrTrx, userId: string, input: RecordSaleInput): Promise<SalePreview> {
  return computeSale(db, userId, input, false);
}

/**
 * Records a sale of an active listing, in one transaction.
 *
 * It snapshots cost of goods, the marketplace fee and commission onto the sale row, so later edits to fee rules or purchases do not rewrite history.
 * It takes `quantity_per_unit × quantity` off each item's quantity on hand.
 * If the sale uses up the listing's quantity, the listing becomes `sold` and its row for the marketplace it sold on becomes `ended`.
 * Rows for other marketplaces stay `active`, so the dashboard can flag them as "take this down".
 *
 * Throws a DomainError if the listing is missing or not active, is not up on that marketplace (a taken-down row does not count), has too few units left, or an item has too little stock.
 * Pass a transaction as `db` to make it part of a larger one.
 */
export async function recordSale(db: Db, userId: string, input: RecordSaleInput): Promise<RecordedSale> {
  const run = async (trx: DbOrTrx): Promise<RecordedSale> => {
    const sale = await computeSale(trx, userId, input, true);
    const soldAt = recordSaleInputSchema.parse(input).soldAt;

    const inserted = await trx
      .insertInto("sale")
      .values({
        user_id: userId,
        listing_id: sale.listingId,
        marketplace_id: sale.marketplaceId,
        sold_at: soldAt,
        quantity: sale.quantity,
        sale_price_cents: sale.salePriceCents,
        shipping_charged_cents: sale.shippingChargedCents,
        shipping_cost_cents: sale.shippingCostCents,
        marketplace_fee_cents: sale.marketplaceFeeCents,
        additional_fees_cents: sale.additionalFeesCents,
        cost_of_goods_cents: sale.costOfGoodsCents,
        commission_cents: sale.breakdown.commissionCents,
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    for (const item of sale.items) {
      await trx
        .updateTable("inventory_item")
        .set((eb) => ({
          quantity_on_hand: eb("quantity_on_hand", "-", item.quantityPerUnit * sale.quantity),
          updated_at: new Date(),
        }))
        .where("id", "=", item.itemId)
        .where("user_id", "=", userId)
        .execute();
    }

    const listingSoldOut = sale.quantity === sale.remainingBefore;
    let stillActiveOnMarketplaceIds: string[] = [];
    if (listingSoldOut) {
      const now = new Date();
      await trx
        .updateTable("listing")
        .set({ status: "sold", ended_at: now, updated_at: now })
        .where("id", "=", sale.listingId)
        .where("user_id", "=", userId)
        .execute();
      await trx
        .updateTable("listing_marketplace")
        .set({ status: "ended", ended_at: now })
        .where("listing_id", "=", sale.listingId)
        .where("marketplace_id", "=", sale.marketplaceId)
        .where("user_id", "=", userId)
        .execute();
      const others = await trx
        .selectFrom("listing_marketplace")
        .select("marketplace_id")
        .where("listing_id", "=", sale.listingId)
        .where("user_id", "=", userId)
        .where("status", "=", "active")
        .execute();
      stillActiveOnMarketplaceIds = others.map((row) => row.marketplace_id);
    }

    return { ...sale, saleId: inserted.id, listingSoldOut, stillActiveOnMarketplaceIds };
  };
  return db.isTransaction ? run(db) : db.transaction().execute(run);
}

/** Profit figures for a stored sale row, from its snapshotted values. Use it for the sales table and the dashboard. */
export function saleRowProfit(sale: {
  sale_price_cents: number;
  shipping_charged_cents: number;
  shipping_cost_cents: number;
  marketplace_fee_cents: number;
  additional_fees_cents: number;
  cost_of_goods_cents: number;
  commission_cents: number;
}): { revenueCents: number; profitBeforeCommissionCents: number; profitCents: number } {
  const revenueCents = sale.sale_price_cents + sale.shipping_charged_cents;
  const profitBeforeCommissionCents =
    revenueCents -
    sale.marketplace_fee_cents -
    sale.shipping_cost_cents -
    sale.additional_fees_cents -
    sale.cost_of_goods_cents;
  return {
    revenueCents,
    profitBeforeCommissionCents,
    profitCents: profitBeforeCommissionCents - sale.commission_cents,
  };
}
