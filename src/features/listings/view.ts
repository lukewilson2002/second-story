import { totalFeePercentBps, totalFixedFeeCents, type FeeTerms } from "@/lib/calc";
import { formatBps, formatCents } from "@/lib/format";
import type { ListingFilter, ListingTab } from "./schemas";
import type { ListingRow } from "./types";

/** Pure helpers for the listing screens. Safe to import from Client Components. */

/**
 * One sentence about a fee rule, as on the listing board: "13% of item price plus shipping, and $0.40 per order."
 * The percent is the marketplace and payment percents added together, because that is what the fee math charges.
 * Pass null if the marketplace has no rule.
 */
export function describeFeeRule(rule: FeeTerms | null): string {
  if (!rule) return "No fee rule yet, so no fees are counted.";
  const percent = totalFeePercentBps(rule);
  const fixed = totalFixedFeeCents(rule);
  const base = rule.appliesToShipping ? "item price plus shipping" : "item price";
  if (percent === 0 && fixed === 0) return "No fees.";
  if (percent === 0) return `${formatCents(fixed)} per order.`;
  if (fixed === 0) return `${formatBps(percent)} of ${base}.`;
  return `${formatBps(percent)} of ${base}, and ${formatCents(fixed)} per order.`;
}

/** The rows a listings tab shows, after the needs-attention filter and the search box. */
export function filterListingRows(
  rows: readonly ListingRow[],
  view: { tab: ListingTab; filter: ListingFilter | null; search: string },
): ListingRow[] {
  const needle = view.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (row.status !== view.tab) return false;
    if (view.filter === "below-minimum" && !row.belowMinimum) return false;
    if (view.filter === "stale" && !row.stale) return false;
    if (view.filter === "still-up" && row.stillUpCount === 0) return false;
    if (needle === "") return true;
    return (
      row.title.toLowerCase().includes(needle) ||
      row.marketplaces.some((marketplace) => marketplace.name.toLowerCase().includes(needle))
    );
  });
}

export const LISTING_FILTER_LABELS: Record<ListingFilter, string> = {
  "below-minimum": "Priced below minimum",
  stale: "Stale listings",
  "still-up": "Sold, still up elsewhere",
};
