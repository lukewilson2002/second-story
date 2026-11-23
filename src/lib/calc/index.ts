/**
 * Pure money math for Second Story.
 * Every amount is integer cents and every percentage is basis points (1250 = 12.5%).
 * Nothing here uses floating point on money: products are integers, and division rounds explicitly.
 * Rounding is half up to the cent (half away from zero for negative amounts).
 */

export const BPS_SCALE = 10_000;

/** The fee terms of one fee rule. Matches the fee_rule table columns. */
export interface FeeTerms {
  /** Marketplace percent of the fee base. */
  percentBps: number;
  /** If true, the percent applies to item price plus shipping charged. If false, to item price only. */
  appliesToShipping: boolean;
  /** Per-order marketplace fee. */
  fixedCents: number;
  /** Payment processing percent, if billed separately. Uses the same fee base. */
  paymentPercentBps: number;
  /** Per-order payment processing fee. */
  paymentFixedCents: number;
}

/** A rule that charges nothing. Used when a marketplace has no fee rule yet. */
export const NO_FEES: FeeTerms = {
  percentBps: 0,
  appliesToShipping: true,
  fixedCents: 0,
  paymentPercentBps: 0,
  paymentFixedCents: 0,
};

function assertInt(name: string, value: number): void {
  if (!Number.isSafeInteger(value)) throw new RangeError(`${name} must be a safe integer, got ${value}`);
}

function assertNonNegativeInt(name: string, value: number): void {
  assertInt(name, value);
  if (value < 0) throw new RangeError(`${name} must not be negative, got ${value}`);
}

function assertFeeTerms(rule: FeeTerms): void {
  assertNonNegativeInt("percentBps", rule.percentBps);
  assertNonNegativeInt("paymentPercentBps", rule.paymentPercentBps);
  assertNonNegativeInt("fixedCents", rule.fixedCents);
  assertNonNegativeInt("paymentFixedCents", rule.paymentFixedCents);
}

/** Integer division that rounds half away from zero. The divisor must be positive. */
export function divRoundHalfUp(numerator: number, divisor: number): number {
  assertInt("numerator", numerator);
  assertInt("divisor", divisor);
  if (divisor <= 0) throw new RangeError("divisor must be positive");
  const magnitude = Math.floor((Math.abs(numerator) * 2 + divisor) / (divisor * 2));
  // `magnitude * -1` would give -0 for zero.
  return numerator < 0 && magnitude !== 0 ? -magnitude : magnitude;
}

/** Integer division that rounds up. The divisor must be positive. */
export function divCeil(numerator: number, divisor: number): number {
  assertInt("numerator", numerator);
  assertInt("divisor", divisor);
  if (divisor <= 0) throw new RangeError("divisor must be positive");
  const quotient = Math.ceil(numerator / divisor);
  // Math.ceil on a float can be off by one for large values. Correct it with integer checks.
  if ((quotient - 1) * divisor >= numerator) return quotient - 1;
  if (quotient * divisor < numerator) return quotient + 1;
  return quotient === 0 ? 0 : quotient;
}

/** `bps` percent of `cents`, rounded half up to the cent. */
export function percentOfCents(cents: number, bps: number): number {
  assertInt("cents", cents);
  assertInt("bps", bps);
  return divRoundHalfUp(cents * bps, BPS_SCALE);
}

/** Marketplace percent plus payment percent, in basis points. */
export function totalFeePercentBps(rule: FeeTerms): number {
  return rule.percentBps + rule.paymentPercentBps;
}

/** Marketplace fixed fee plus payment fixed fee, in cents. */
export function totalFixedFeeCents(rule: FeeTerms): number {
  return rule.fixedCents + rule.paymentFixedCents;
}

export interface FeeInput {
  /** Item price paid by the buyer. */
  priceCents: number;
  /** Shipping the buyer pays. */
  shippingChargedCents: number;
  rule: FeeTerms;
}

/**
 * Marketplace fee = f × (P + Sc) + F.
 * If the rule does not apply to shipping, the fee base is the item price alone.
 * The percent part is rounded once, on the combined marketplace and payment percent.
 */
export function marketplaceFeeCents({ priceCents, shippingChargedCents, rule }: FeeInput): number {
  assertNonNegativeInt("priceCents", priceCents);
  assertNonNegativeInt("shippingChargedCents", shippingChargedCents);
  assertFeeTerms(rule);
  const base = rule.appliesToShipping ? priceCents + shippingChargedCents : priceCents;
  return percentOfCents(base, totalFeePercentBps(rule)) + totalFixedFeeCents(rule);
}

export interface ProfitInput {
  /** P: item price. */
  priceCents: number;
  /** Sc: shipping charged to the buyer. */
  shippingChargedCents: number;
  /** Sa: actual shipping cost. */
  shippingCostCents: number;
  /** The marketplace fee, already worked out (or typed in to match the real payout). */
  marketplaceFeeCents: number;
  /** X: promotions and ad fees. */
  additionalFeesCents: number;
  /** C: cost of goods. */
  costOfGoodsCents: number;
}

/** Profit before commission = P + Sc − fee − Sa − X − C. Can be negative. */
export function profitBeforeCommissionCents(input: ProfitInput): number {
  assertNonNegativeInt("priceCents", input.priceCents);
  assertNonNegativeInt("shippingChargedCents", input.shippingChargedCents);
  assertNonNegativeInt("shippingCostCents", input.shippingCostCents);
  assertNonNegativeInt("marketplaceFeeCents", input.marketplaceFeeCents);
  assertNonNegativeInt("additionalFeesCents", input.additionalFeesCents);
  assertNonNegativeInt("costOfGoodsCents", input.costOfGoodsCents);
  return (
    input.priceCents +
    input.shippingChargedCents -
    input.marketplaceFeeCents -
    input.shippingCostCents -
    input.additionalFeesCents -
    input.costOfGoodsCents
  );
}

/**
 * Commission = c × max(0, profit before commission).
 * Commission is a share of profit, so a loss pays no commission.
 */
export function commissionCents(profitBeforeCommission: number, commissionBps: number): number {
  assertInt("profitBeforeCommission", profitBeforeCommission);
  assertCommissionBps(commissionBps);
  return percentOfCents(Math.max(0, profitBeforeCommission), commissionBps);
}

function assertCommissionBps(commissionBps: number): void {
  assertNonNegativeInt("commissionBps", commissionBps);
  if (commissionBps > BPS_SCALE) throw new RangeError("commissionBps must not exceed 10000");
}

/** Profit = profit before commission − commission. */
export function profitCents(profitBeforeCommission: number, commissionBps: number): number {
  return profitBeforeCommission - commissionCents(profitBeforeCommission, commissionBps);
}

export interface SaleBreakdownInput {
  priceCents: number;
  shippingChargedCents: number;
  shippingCostCents: number;
  additionalFeesCents: number;
  costOfGoodsCents: number;
  /** Null or 0 means no commission. */
  commissionBps: number | null;
  rule: FeeTerms;
  /** If set, this replaces the fee worked out from the rule. */
  marketplaceFeeOverrideCents?: number | undefined;
}

export interface SaleBreakdown {
  /** P + Sc: everything the buyer paid. */
  totalPaidCents: number;
  marketplaceFeeCents: number;
  profitBeforeCommissionCents: number;
  commissionCents: number;
  profitCents: number;
  /** Profit as a share of total paid, in basis points. Null if nothing was paid. */
  marginBps: number | null;
}

/** Runs the whole chain for one sale or one projected sale: fee, profit before commission, commission, profit, margin. */
export function saleBreakdown(input: SaleBreakdownInput): SaleBreakdown {
  const fee =
    input.marketplaceFeeOverrideCents ??
    marketplaceFeeCents({
      priceCents: input.priceCents,
      shippingChargedCents: input.shippingChargedCents,
      rule: input.rule,
    });
  const before = profitBeforeCommissionCents({
    priceCents: input.priceCents,
    shippingChargedCents: input.shippingChargedCents,
    shippingCostCents: input.shippingCostCents,
    marketplaceFeeCents: fee,
    additionalFeesCents: input.additionalFeesCents,
    costOfGoodsCents: input.costOfGoodsCents,
  });
  const commission = commissionCents(before, input.commissionBps ?? 0);
  const profit = before - commission;
  const totalPaid = input.priceCents + input.shippingChargedCents;
  return {
    totalPaidCents: totalPaid,
    marketplaceFeeCents: fee,
    profitBeforeCommissionCents: before,
    commissionCents: commission,
    profitCents: profit,
    marginBps: marginBps(profit, totalPaid),
  };
}

/** Profit as a share of revenue, in basis points, rounded half up. Null if revenue is zero or negative. */
export function marginBps(profit: number, revenueCents: number): number | null {
  assertInt("profit", profit);
  assertInt("revenueCents", revenueCents);
  if (revenueCents <= 0) return null;
  return divRoundHalfUp(profit * BPS_SCALE, revenueCents);
}

export interface MinimumPriceInput {
  /** C: cost of goods. */
  costOfGoodsCents: number;
  /** Sa: expected shipping cost. */
  shippingCostCents: number;
  /** Sc: shipping charged to the buyer. */
  shippingChargedCents: number;
  rule: FeeTerms;
}

/**
 * The closed-form minimum price: `(C + Sa + F + N) / (1 − f) − Sc`, rounded up to the cent.
 * N is the profit before commission needed for the target, `T / (1 − c)`, rounded up to the cent.
 *
 * Rounding up twice keeps the result safe. At this price the rounded fee and commission never push profit under the target.
 * Fees round to the cent, so a price one cent lower can sometimes reach the target too.
 */
function lowestPriceReaching(
  targetProfitCents: number,
  input: MinimumPriceInput,
  commissionBps: number,
): number | null {
  assertNonNegativeInt("costOfGoodsCents", input.costOfGoodsCents);
  assertNonNegativeInt("shippingCostCents", input.shippingCostCents);
  assertNonNegativeInt("shippingChargedCents", input.shippingChargedCents);
  assertNonNegativeInt("targetProfitCents", targetProfitCents);
  assertFeeTerms(input.rule);
  assertCommissionBps(commissionBps);

  const feeBps = totalFeePercentBps(input.rule);
  // At a 100% fee every extra cent of price goes to the marketplace, so no price reaches any target.
  if (feeBps >= BPS_SCALE) return null;
  // At 100% commission profit is always zero, so only a zero target can be reached.
  if (commissionBps >= BPS_SCALE && targetProfitCents > 0) return null;

  const keepBps = BPS_SCALE - feeBps;
  const neededBeforeCommission =
    commissionBps >= BPS_SCALE
      ? 0
      : divCeil(targetProfitCents * BPS_SCALE, BPS_SCALE - commissionBps);
  const fixed = totalFixedFeeCents(input.rule);
  const costs = input.costOfGoodsCents + input.shippingCostCents + fixed + neededBeforeCommission;
  // Fee on shipping: P = costs / (1 − f) − Sc. Fee on price only: P = (costs − Sc) / (1 − f).
  const price = input.rule.appliesToShipping
    ? divCeil(costs * BPS_SCALE, keepBps) - input.shippingChargedCents
    : divCeil((costs - input.shippingChargedCents) * BPS_SCALE, keepBps);
  return Math.max(0, price);
}

/**
 * Minimum item price to break even: `(C + Sa + F) / (1 − f) − Sc`, rounded up to the cent.
 * If the fee rule does not apply to shipping, it is `(C + Sa + F − Sc) / (1 − f)`.
 * Commission is zero at break-even, so it drops out.
 * Additional fees are left out because promotions are only known at sale time.
 * The result is never below zero. If shipping charged already covers every cost, it is 0.
 * Returns null if the fee percent is 100% or more, because no price breaks even.
 */
export function minimumPriceToBreakEvenCents(input: MinimumPriceInput): number | null {
  return lowestPriceReaching(0, input, 0);
}

export interface TargetPriceInput extends MinimumPriceInput {
  /** T: the profit wanted after commission. */
  targetProfitCents: number;
  /** Null or 0 means no commission. */
  commissionBps: number | null;
}

/**
 * Minimum item price for a target profit T: `(C + Sa + F + T / (1 − c)) / (1 − f) − Sc`, rounded up to the cent.
 * Returns null if no price can reach the target: a fee percent of 100% or more, or a 100% commission with a target above zero.
 */
export function minimumPriceForTargetProfitCents(input: TargetPriceInput): number | null {
  return lowestPriceReaching(input.targetProfitCents, input, input.commissionBps ?? 0);
}

/**
 * Splits one lot price evenly across `count` items.
 * If the split leaves a remainder, the extra cents go to the first item.
 * The shares always add up to the total.
 */
export function splitLotEvenly(totalCents: number, count: number): number[] {
  assertNonNegativeInt("totalCents", totalCents);
  assertInt("count", count);
  if (count <= 0) throw new RangeError("count must be at least 1");
  const share = Math.floor(totalCents / count);
  const remainder = totalCents - share * count;
  return Array.from({ length: count }, (_, index) => (index === 0 ? share + remainder : share));
}

export interface PurchaseLot {
  quantity: number;
  unitCostCents: number;
}

/**
 * Weighted average unit cost across purchases: total cost ÷ total quantity, rounded half up to the cent.
 * Returns 0 if there are no units.
 */
export function weightedAverageUnitCostCents(purchases: readonly PurchaseLot[]): number {
  let totalCost = 0;
  let totalQuantity = 0;
  for (const purchase of purchases) {
    assertNonNegativeInt("quantity", purchase.quantity);
    assertNonNegativeInt("unitCostCents", purchase.unitCostCents);
    totalCost += purchase.quantity * purchase.unitCostCents;
    totalQuantity += purchase.quantity;
  }
  return averageUnitCostCents(totalCost, totalQuantity);
}

/** Total cost ÷ total quantity, rounded half up. Returns 0 if the quantity is zero. Use this with SQL sums. */
export function averageUnitCostCents(totalCostCents: number, totalQuantity: number): number {
  assertNonNegativeInt("totalCostCents", totalCostCents);
  assertNonNegativeInt("totalQuantity", totalQuantity);
  if (totalQuantity === 0) return 0;
  return divRoundHalfUp(totalCostCents, totalQuantity);
}
