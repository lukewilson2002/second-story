import { marketplaceFeeCents, totalFeePercentBps, type FeeTerms } from "@/lib/calc";
import { formatBps, formatCents } from "@/lib/format";

/** Wording and sample maths for fee rules. Pure, and safe to import from Client Components. */

function percentPlusFixed(bps: number, cents: number): string | null {
  if (bps === 0 && cents === 0) return null;
  if (cents === 0) return formatBps(bps);
  if (bps === 0) return formatCents(cents);
  return `${formatBps(bps)} + ${formatCents(cents)}`;
}

/**
 * One line that reads a rule back, for example "13% + $0.40 per order, plus 2.9% + $0.30 payment processing".
 * A rule with every value at zero reads "No fees".
 */
export function describeFeeTerms(rule: FeeTerms): string {
  const marketplace = percentPlusFixed(rule.percentBps, rule.fixedCents);
  const payment = percentPlusFixed(rule.paymentPercentBps, rule.paymentFixedCents);
  if (marketplace === null && payment === null) return "No fees";
  const parts: string[] = [];
  if (marketplace !== null) parts.push(`${marketplace} per order`);
  if (payment !== null) parts.push(`${payment} payment processing`);
  return parts.join(", plus ");
}

/** Says what the percentage is charged on. Returns null if the rule has no percentage, because then it makes no difference. */
export function describeFeeBase(rule: FeeTerms): string | null {
  if (totalFeePercentBps(rule) === 0) return null;
  return rule.appliesToShipping ? "Percent applies to item price and shipping" : "Percent applies to item price only";
}

/**
 * The fee a rule charges on a sample price, through the shared calc module.
 * Returns null while the values cannot make a rule: an amount is missing, or the two percentages reach 100%.
 */
export function sampleFeeCents(
  rule: { [Key in keyof FeeTerms]: FeeTerms[Key] | null },
  priceCents: number | null,
  shippingChargedCents: number | null,
): number | null {
  const { percentBps, fixedCents, paymentPercentBps, paymentFixedCents, appliesToShipping } = rule;
  if (
    percentBps === null ||
    fixedCents === null ||
    paymentPercentBps === null ||
    paymentFixedCents === null ||
    appliesToShipping === null ||
    priceCents === null ||
    shippingChargedCents === null ||
    percentBps + paymentPercentBps >= 10_000
  ) {
    return null;
  }
  return marketplaceFeeCents({
    priceCents,
    shippingChargedCents,
    rule: { percentBps, fixedCents, paymentPercentBps, paymentFixedCents, appliesToShipping },
  });
}
