import type { FeeTerms } from "@/lib/calc";

/** Plain records passed from Server Components to the sales screens. No functions, no Dates. */

export interface SellableMarketplace {
  marketplaceId: string;
  name: string;
  /** The price in effect on this marketplace, per unit: its override, or the listing's asking price. */
  askingPriceCents: number;
  /** The fee rule that applies here, or NO_FEES. */
  rule: FeeTerms;
}

/** An active listing with units left, as the mark-sold form needs it. */
export interface SellableListing {
  id: string;
  title: string;
  quantityLeft: number;
  /** Shipping the buyer pays, per unit. */
  shippingChargedCents: number;
  commissionBps: number | null;
  /** Cost of goods for one unit, from today's average unit costs. */
  unitCostCents: number;
  /** The marketplaces it is still up on. Never empty. */
  marketplaces: SellableMarketplace[];
}

/** One row of the sales table and of the CSV export. */
export interface SaleRow {
  id: string;
  soldAt: string;
  listingId: string;
  listingTitle: string;
  marketplaceName: string;
  quantity: number;
  salePriceCents: number;
  shippingChargedCents: number;
  shippingCostCents: number;
  marketplaceFeeCents: number;
  additionalFeesCents: number;
  costOfGoodsCents: number;
  commissionCents: number;
  commissionPayee: string | null;
  /** "YYYY-MM-DD", or null while the commission is still owed. */
  commissionPaidAt: string | null;
  /** Item price plus shipping charged. */
  revenueCents: number;
  profitBeforeCommissionCents: number;
  profitCents: number;
  /** Profit over revenue. Null if nothing was paid. */
  marginBps: number | null;
}
