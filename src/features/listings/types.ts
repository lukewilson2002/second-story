import type { CategoryRecord } from "@/lib/domain/categories";
import type { FeeRuleRecord } from "@/lib/domain/fees";
import type { ListingStatus } from "@/lib/schemas";

/** Plain records passed from Server Components to the listing screens. No functions, no Dates. */

export interface ListingRowMarketplace {
  marketplaceId: string;
  name: string;
  status: "active" | "ended";
  externalUrl: string | null;
}

/** One row of the listings table. */
export interface ListingRow {
  id: string;
  title: string;
  status: ListingStatus;
  marketplaces: ListingRowMarketplace[];
  /** The listing's own asking price per unit, before any marketplace override. */
  askingPriceCents: number;
  /**
   * The highest break-even price across the marketplaces the listing is up on.
   * Null if it is on no marketplace, or if no price can break even on one of them.
   */
  minimumPriceCents: number | null;
  /** True if the price on at least one marketplace it is up on is under that marketplace's minimum. */
  belowMinimum: boolean;
  /** Days from being published, or last relisted, to today. For a sold or ended listing, to the day it sold or ended. Null for a draft. */
  daysListed: number | null;
  quantity: number;
  soldQuantity: number;
  /** True for an active listing that has been up for more than STALE_LISTING_DAYS days. */
  stale: boolean;
  /** For a sold listing: how many marketplaces it is still marked active on. */
  stillUpCount: number;
}

/** An inventory item that can be put in a listing. */
export interface ListingItemOption {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  /** The top-level category id, which picks the thumbnail colour. */
  toneKey: string;
  imageUrl: string | null;
  quantityOnHand: number;
  avgUnitCostCents: number;
  /** Lower-cased title and identifiers, for the picker's search. */
  searchText: string;
}

export interface MarketplaceOption {
  id: string;
  name: string;
}

/** Everything the listing form needs besides the listing itself. */
export interface ListingFormOptions {
  items: ListingItemOption[];
  marketplaces: MarketplaceOption[];
  feeRules: FeeRuleRecord[];
  categories: CategoryRecord[];
  defaultCommissionBps: number | null;
  defaultCommissionPayee: string | null;
}

export interface ListingFormMarketplaceValue {
  marketplaceId: string;
  /** Text of the link field. */
  url: string;
  /** Text of the price override field. Empty means the listing's asking price applies. */
  price: string;
}

/** The starting values of the listing form. */
export interface ListingFormValues {
  id: string | null;
  status: ListingStatus;
  title: string;
  askingPriceCents: number | null;
  quantity: number;
  shippingChargedCents: number;
  estShippingCostCents: number;
  commissionBps: number | null;
  commissionPayee: string;
  items: { itemId: string; quantityPerUnit: number }[];
  marketplaces: ListingFormMarketplaceValue[];
  soldQuantity: number;
}

export interface ListingDetailMarketplace extends ListingRowMarketplace {
  /** The price in effect on this marketplace. */
  askingPriceCents: number;
  minimumPriceCents: number | null;
  belowMinimum: boolean;
  /** Profit if one unit sells at the asking price here. */
  projectedProfitCents: number;
  projectedFeeCents: number;
}

export interface ListingDetailSale {
  id: string;
  soldAt: string;
  marketplaceName: string;
  quantity: number;
  revenueCents: number;
  profitCents: number;
}

/** A listing with everything its detail page shows. */
export interface ListingDetail {
  values: ListingFormValues;
  listedAt: string | null;
  endedAt: string | null;
  daysListed: number | null;
  unitCostCents: number;
  items: { itemId: string; title: string; quantityPerUnit: number; avgUnitCostCents: number; quantityOnHand: number }[];
  marketplaces: ListingDetailMarketplace[];
  sales: ListingDetailSale[];
}
