import { describe, expect, it } from "vitest";
import {
  NO_FEES,
  averageUnitCostCents,
  commissionCents,
  divCeil,
  divRoundHalfUp,
  marginBps,
  marketplaceFeeCents,
  minimumPriceForTargetProfitCents,
  minimumPriceToBreakEvenCents,
  percentOfCents,
  profitBeforeCommissionCents,
  profitCents,
  saleBreakdown,
  splitLotEvenly,
  weightedAverageUnitCostCents,
  type FeeTerms,
  type MinimumPriceInput,
} from "./index";

const rule = (overrides: Partial<FeeTerms> = {}): FeeTerms => ({ ...NO_FEES, ...overrides });

// The fee rules shown on the New listing board.
const EBAY = rule({ percentBps: 1300, fixedCents: 40 });
const MERCARI = rule({ percentBps: 1000, fixedCents: 50 });

describe("rounding helpers", () => {
  it("rounds half up to the cent", () => {
    expect(divRoundHalfUp(5, 10)).toBe(1);
    expect(divRoundHalfUp(4, 10)).toBe(0);
    expect(divRoundHalfUp(15, 10)).toBe(2);
    expect(divRoundHalfUp(14, 10)).toBe(1);
    expect(divRoundHalfUp(0, 10)).toBe(0);
  });

  it("rounds negative amounts half away from zero", () => {
    expect(divRoundHalfUp(-5, 10)).toBe(-1);
    expect(divRoundHalfUp(-4, 10)).toBe(0);
    expect(Object.is(divRoundHalfUp(-4, 10), 0)).toBe(true);
    expect(divRoundHalfUp(-15, 10)).toBe(-2);
  });

  it("rounds up for divCeil, including negatives", () => {
    expect(divCeil(10, 5)).toBe(2);
    expect(divCeil(11, 5)).toBe(3);
    expect(divCeil(0, 5)).toBe(0);
    expect(divCeil(-11, 5)).toBe(-2);
    expect(divCeil(-10, 5)).toBe(-2);
    expect(Object.is(divCeil(-1, 5), 0)).toBe(true);
  });

  it("keeps divCeil exact for large values", () => {
    expect(divCeil(9_007_199_254_740_991, 10_000)).toBe(900_719_925_475);
    expect(divCeil(9_007_199_254_740_000, 10_000)).toBe(900_719_925_474);
  });

  it("rejects non-integers and non-positive divisors", () => {
    expect(() => divRoundHalfUp(1.5, 10)).toThrow(RangeError);
    expect(() => divRoundHalfUp(1, 0)).toThrow(RangeError);
    expect(() => divCeil(1, -1)).toThrow(RangeError);
    expect(() => percentOfCents(10.5, 100)).toThrow(RangeError);
  });

  it("takes a percentage of cents", () => {
    expect(percentOfCents(4999, 1300)).toBe(650);
    expect(percentOfCents(1000, 1250)).toBe(125);
    expect(percentOfCents(1, 5000)).toBe(1);
    expect(percentOfCents(1, 4999)).toBe(0);
    expect(percentOfCents(0, 1300)).toBe(0);
    expect(percentOfCents(1234, 0)).toBe(0);
    expect(percentOfCents(1234, 10_000)).toBe(1234);
  });
});

describe("marketplaceFeeCents", () => {
  it("matches the eBay example on the listing board", () => {
    expect(marketplaceFeeCents({ priceCents: 4499, shippingChargedCents: 500, rule: EBAY })).toBe(690);
  });

  it("applies the percent to price plus shipping by default", () => {
    expect(
      marketplaceFeeCents({ priceCents: 2000, shippingChargedCents: 500, rule: rule({ percentBps: 1000 }) }),
    ).toBe(250);
  });

  it("drops shipping from the fee base when the rule does not apply to shipping", () => {
    expect(
      marketplaceFeeCents({
        priceCents: 2000,
        shippingChargedCents: 500,
        rule: rule({ percentBps: 1000, appliesToShipping: false }),
      }),
    ).toBe(200);
  });

  it("adds the marketplace and payment percents and both fixed fees", () => {
    const combined = rule({
      percentBps: 1000,
      paymentPercentBps: 290,
      fixedCents: 40,
      paymentFixedCents: 30,
    });
    // 12.9% of 2500 = 322.5, rounded half up to 323, plus 70 fixed.
    expect(marketplaceFeeCents({ priceCents: 2000, shippingChargedCents: 500, rule: combined })).toBe(393);
  });

  it("rounds the combined percent once, not each part", () => {
    // 1.25% + 1.25% of 100 cents: each part alone rounds 1.25 down to 1, together 2.5 rounds to 3.
    const combined = rule({ percentBps: 125, paymentPercentBps: 125 });
    expect(marketplaceFeeCents({ priceCents: 100, shippingChargedCents: 0, rule: combined })).toBe(3);
  });

  it("charges only the fixed fees on a zero price", () => {
    expect(marketplaceFeeCents({ priceCents: 0, shippingChargedCents: 0, rule: EBAY })).toBe(40);
  });

  it("charges nothing with no fees", () => {
    expect(marketplaceFeeCents({ priceCents: 4499, shippingChargedCents: 500, rule: NO_FEES })).toBe(0);
  });

  it("takes everything at a 100% fee", () => {
    expect(
      marketplaceFeeCents({ priceCents: 4499, shippingChargedCents: 500, rule: rule({ percentBps: 10_000 }) }),
    ).toBe(4999);
  });

  it("handles a fee one basis point under 100%", () => {
    expect(
      marketplaceFeeCents({ priceCents: 10_000, shippingChargedCents: 0, rule: rule({ percentBps: 9999 }) }),
    ).toBe(9999);
  });

  it("rejects negative or fractional amounts", () => {
    expect(() => marketplaceFeeCents({ priceCents: -1, shippingChargedCents: 0, rule: EBAY })).toThrow(RangeError);
    expect(() => marketplaceFeeCents({ priceCents: 10.5, shippingChargedCents: 0, rule: EBAY })).toThrow(RangeError);
    expect(() =>
      marketplaceFeeCents({ priceCents: 10, shippingChargedCents: 0, rule: rule({ percentBps: -1 }) }),
    ).toThrow(RangeError);
  });
});

describe("profit and commission", () => {
  const base = {
    priceCents: 4499,
    shippingChargedCents: 500,
    shippingCostCents: 560,
    marketplaceFeeCents: 690,
    additionalFeesCents: 0,
    costOfGoodsCents: 1800,
  };

  it("matches the board: profit before commission", () => {
    expect(profitBeforeCommissionCents(base)).toBe(1949);
  });

  it("subtracts additional fees", () => {
    expect(profitBeforeCommissionCents({ ...base, additionalFeesCents: 249 })).toBe(1700);
  });

  it("can be negative", () => {
    expect(profitBeforeCommissionCents({ ...base, costOfGoodsCents: 5000 })).toBe(-1251);
  });

  it("matches the board: commission and profit", () => {
    expect(commissionCents(1949, 2000)).toBe(390);
    expect(profitCents(1949, 2000)).toBe(1559);
  });

  it("pays no commission on a loss or on zero profit", () => {
    expect(commissionCents(-1251, 2000)).toBe(0);
    expect(profitCents(-1251, 2000)).toBe(-1251);
    expect(commissionCents(0, 2000)).toBe(0);
  });

  it("handles 0% and 100% commission", () => {
    expect(commissionCents(1949, 0)).toBe(0);
    expect(profitCents(1949, 0)).toBe(1949);
    expect(commissionCents(1949, 10_000)).toBe(1949);
    expect(profitCents(1949, 10_000)).toBe(0);
  });

  it("rounds commission half up", () => {
    expect(commissionCents(5, 5000)).toBe(3);
    expect(commissionCents(1, 4999)).toBe(0);
    expect(commissionCents(1, 9999)).toBe(1);
  });

  it("rejects a commission over 100% or below 0%", () => {
    expect(() => commissionCents(100, 10_001)).toThrow(RangeError);
    expect(() => commissionCents(100, -1)).toThrow(RangeError);
  });
});

describe("saleBreakdown", () => {
  it("matches every number on the listing board for eBay", () => {
    expect(
      saleBreakdown({
        priceCents: 4499,
        shippingChargedCents: 500,
        shippingCostCents: 560,
        additionalFeesCents: 0,
        costOfGoodsCents: 1800,
        commissionBps: 2000,
        rule: EBAY,
      }),
    ).toEqual({
      totalPaidCents: 4999,
      marketplaceFeeCents: 690,
      profitBeforeCommissionCents: 1949,
      commissionCents: 390,
      profitCents: 1559,
      marginBps: 3119,
    });
  });

  it("uses the fee override instead of the rule", () => {
    const result = saleBreakdown({
      priceCents: 4499,
      shippingChargedCents: 500,
      shippingCostCents: 560,
      additionalFeesCents: 0,
      costOfGoodsCents: 1800,
      commissionBps: null,
      rule: EBAY,
      marketplaceFeeOverrideCents: 700,
    });
    expect(result.marketplaceFeeCents).toBe(700);
    expect(result.profitBeforeCommissionCents).toBe(1939);
    expect(result.commissionCents).toBe(0);
    expect(result.profitCents).toBe(1939);
  });

  it("accepts a zero fee override", () => {
    const result = saleBreakdown({
      priceCents: 1000,
      shippingChargedCents: 0,
      shippingCostCents: 0,
      additionalFeesCents: 0,
      costOfGoodsCents: 0,
      commissionBps: 0,
      rule: EBAY,
      marketplaceFeeOverrideCents: 0,
    });
    expect(result.marketplaceFeeCents).toBe(0);
    expect(result.profitCents).toBe(1000);
  });

  it("has no margin when nothing was paid", () => {
    const result = saleBreakdown({
      priceCents: 0,
      shippingChargedCents: 0,
      shippingCostCents: 0,
      additionalFeesCents: 0,
      costOfGoodsCents: 500,
      commissionBps: 2000,
      rule: NO_FEES,
    });
    expect(result.marginBps).toBeNull();
    expect(result.profitCents).toBe(-500);
  });
});

describe("marginBps", () => {
  it("is profit over revenue in basis points", () => {
    expect(marginBps(1559, 4999)).toBe(3119);
    expect(marginBps(500, 1000)).toBe(5000);
    expect(marginBps(-250, 1000)).toBe(-2500);
    expect(marginBps(0, 1000)).toBe(0);
  });

  it("is null without revenue", () => {
    expect(marginBps(100, 0)).toBeNull();
  });
});

describe("minimumPriceToBreakEvenCents", () => {
  const board: Omit<MinimumPriceInput, "rule"> = {
    costOfGoodsCents: 1800,
    shippingCostCents: 560,
    shippingChargedCents: 500,
  };

  it("matches the listing board for eBay and Mercari", () => {
    expect(minimumPriceToBreakEvenCents({ ...board, rule: EBAY })).toBe(2259);
    expect(minimumPriceToBreakEvenCents({ ...board, rule: MERCARI })).toBe(2178);
  });

  it("is cost plus shipping cost with no fees and no shipping charged", () => {
    expect(
      minimumPriceToBreakEvenCents({
        costOfGoodsCents: 1800,
        shippingCostCents: 560,
        shippingChargedCents: 0,
        rule: NO_FEES,
      }),
    ).toBe(2360);
  });

  it("rounds up to the cent", () => {
    // 1000 / 0.87 = 1149.43, so 1149 loses a cent and 1150 breaks even.
    expect(
      minimumPriceToBreakEvenCents({
        costOfGoodsCents: 1000,
        shippingCostCents: 0,
        shippingChargedCents: 0,
        rule: rule({ percentBps: 1300 }),
      }),
    ).toBe(1150);
  });

  it("solves for price alone when the fee does not apply to shipping", () => {
    // P × 0.9 + 500 − 560 − 1800 − 50 >= 0, so P >= 2122.3.
    expect(
      minimumPriceToBreakEvenCents({
        ...board,
        rule: rule({ percentBps: 1000, fixedCents: 50, appliesToShipping: false }),
      }),
    ).toBe(2123);
  });

  it("is lower when the fee skips shipping than when it covers it", () => {
    const onShipping = minimumPriceToBreakEvenCents({ ...board, rule: rule({ percentBps: 1000 }) });
    const priceOnly = minimumPriceToBreakEvenCents({
      ...board,
      rule: rule({ percentBps: 1000, appliesToShipping: false }),
    });
    expect(onShipping).toBe(2123);
    expect(priceOnly).toBe(2067);
  });

  it("is zero when shipping charged covers every cost", () => {
    expect(
      minimumPriceToBreakEvenCents({
        costOfGoodsCents: 100,
        shippingCostCents: 300,
        shippingChargedCents: 2000,
        rule: EBAY,
      }),
    ).toBe(0);
  });

  it("is zero for a free item with no fees", () => {
    expect(
      minimumPriceToBreakEvenCents({
        costOfGoodsCents: 0,
        shippingCostCents: 0,
        shippingChargedCents: 0,
        rule: NO_FEES,
      }),
    ).toBe(0);
  });

  it("covers the fixed fee for a free item", () => {
    // P × 0.87 >= 40, so P >= 45.98.
    expect(
      minimumPriceToBreakEvenCents({
        costOfGoodsCents: 0,
        shippingCostCents: 0,
        shippingChargedCents: 0,
        rule: EBAY,
      }),
    ).toBe(46);
  });

  it("is null at a 100% fee or more", () => {
    expect(minimumPriceToBreakEvenCents({ ...board, rule: rule({ percentBps: 10_000 }) })).toBeNull();
    expect(
      minimumPriceToBreakEvenCents({ ...board, rule: rule({ percentBps: 9000, paymentPercentBps: 1000 }) }),
    ).toBeNull();
    expect(
      minimumPriceToBreakEvenCents({ ...board, rule: rule({ percentBps: 9000, paymentPercentBps: 1500 }) }),
    ).toBeNull();
  });

  it("still finds a price one basis point under a 100% fee", () => {
    const input = { costOfGoodsCents: 100, shippingCostCents: 0, shippingChargedCents: 0, rule: rule({ percentBps: 9999 }) };
    const price = minimumPriceToBreakEvenCents(input);
    expect(price).not.toBeNull();
    const at = saleBreakdown({ ...input, priceCents: price ?? 0, additionalFeesCents: 0, commissionBps: 0 });
    const below = saleBreakdown({ ...input, priceCents: (price ?? 0) - 1, additionalFeesCents: 0, commissionBps: 0 });
    expect(at.profitCents).toBeGreaterThanOrEqual(0);
    expect(below.profitCents).toBeLessThanOrEqual(0);
  });

  it("never loses money, and a cent less never makes money, across many inputs", () => {
    const rules = [
      NO_FEES,
      EBAY,
      MERCARI,
      rule({ percentBps: 1325, paymentPercentBps: 290, fixedCents: 30, paymentFixedCents: 30 }),
      rule({ percentBps: 1500, fixedCents: 99, appliesToShipping: false }),
      rule({ percentBps: 3333 }),
      rule({ percentBps: 1, fixedCents: 1 }),
      rule({ percentBps: 5000, appliesToShipping: false }),
    ];
    let checked = 0;
    for (const feeRule of rules) {
      for (const costOfGoodsCents of [0, 1, 99, 250, 1800, 12_345]) {
        for (const shippingCostCents of [0, 1, 560, 1299]) {
          for (const shippingChargedCents of [0, 1, 500, 999, 5000]) {
            const input = { costOfGoodsCents, shippingCostCents, shippingChargedCents, rule: feeRule };
            const price = minimumPriceToBreakEvenCents(input);
            if (price === null) throw new Error("expected a price");
            const profitAt = (priceCents: number) =>
              saleBreakdown({ ...input, priceCents, additionalFeesCents: 0, commissionBps: 2000 }).profitCents;
            expect(profitAt(price)).toBeGreaterThanOrEqual(0);
            if (price > 0) expect(profitAt(price - 1)).toBeLessThanOrEqual(0);
            checked += 1;
          }
        }
      }
    }
    expect(checked).toBe(960);
  });

  it("rejects negative costs", () => {
    expect(() => minimumPriceToBreakEvenCents({ ...board, costOfGoodsCents: -1, rule: EBAY })).toThrow(RangeError);
  });
});

describe("minimumPriceForTargetProfitCents", () => {
  const board = {
    costOfGoodsCents: 1800,
    shippingCostCents: 560,
    shippingChargedCents: 500,
    rule: EBAY,
  };

  it("equals break-even for a zero target, whatever the commission", () => {
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 0, commissionBps: 2000 })).toBe(2259);
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 0, commissionBps: null })).toBe(2259);
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 0, commissionBps: 10_000 })).toBe(2259);
  });

  it("follows the formula with no commission", () => {
    // (1800 + 560 + 40 + 1000) / 0.87 − 500 = 3408.05
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 1000, commissionBps: 0 })).toBe(3409);
  });

  it("grosses the target up for commission", () => {
    // (1800 + 560 + 40 + 1000 / 0.8) / 0.87 − 500 = 3695.40
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 1000, commissionBps: 2000 })).toBe(3696);
  });

  it("recovers the asking price from the profit shown on the board", () => {
    // The board shows $15.59 profit at $44.99.
    expect(minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 1559, commissionBps: 2000 })).toBe(4499);
  });

  it("is null when the target cannot be reached", () => {
    expect(
      minimumPriceForTargetProfitCents({ ...board, targetProfitCents: 1, commissionBps: 10_000 }),
    ).toBeNull();
    expect(
      minimumPriceForTargetProfitCents({
        ...board,
        rule: rule({ percentBps: 10_000 }),
        targetProfitCents: 100,
        commissionBps: 0,
      }),
    ).toBeNull();
  });

  it("works when the fee does not apply to shipping", () => {
    // P × 0.9 + 500 − 560 − 1800 >= 1000 / 0.75, so P >= 3548.2.
    expect(
      minimumPriceForTargetProfitCents({
        ...board,
        rule: rule({ percentBps: 1000, appliesToShipping: false }),
        targetProfitCents: 1000,
        commissionBps: 2500,
      }),
    ).toBe(3549);
  });

  it("always reaches the target, and two cents less never beats it, across many inputs", () => {
    const rules = [NO_FEES, EBAY, MERCARI, rule({ percentBps: 1500, fixedCents: 99, appliesToShipping: false })];
    for (const feeRule of rules) {
      for (const commissionBps of [0, 1, 1000, 2000, 3333, 5000, 9999]) {
        for (const targetProfitCents of [0, 1, 50, 999, 2500]) {
          for (const shippingChargedCents of [0, 500, 4000]) {
            const input = { costOfGoodsCents: 1800, shippingCostCents: 560, shippingChargedCents, rule: feeRule };
            const price = minimumPriceForTargetProfitCents({ ...input, targetProfitCents, commissionBps });
            if (price === null) throw new Error("expected a price");
            const profitAt = (priceCents: number) =>
              saleBreakdown({ ...input, priceCents, additionalFeesCents: 0, commissionBps }).profitCents;
            expect(profitAt(price)).toBeGreaterThanOrEqual(targetProfitCents);
            if (price > 1) expect(profitAt(price - 2)).toBeLessThanOrEqual(targetProfitCents);
          }
        }
      }
    }
  });

  it("rejects a negative target", () => {
    expect(() =>
      minimumPriceForTargetProfitCents({ ...board, targetProfitCents: -1, commissionBps: 0 }),
    ).toThrow(RangeError);
  });
});

describe("splitLotEvenly", () => {
  it("splits evenly when it divides", () => {
    expect(splitLotEvenly(900, 3)).toEqual([300, 300, 300]);
  });

  it("gives the remainder to the first item", () => {
    expect(splitLotEvenly(1000, 3)).toEqual([334, 333, 333]);
    expect(splitLotEvenly(1001, 3)).toEqual([335, 333, 333]);
    expect(splitLotEvenly(5, 4)).toEqual([2, 1, 1, 1]);
  });

  it("handles a total smaller than the count", () => {
    expect(splitLotEvenly(2, 5)).toEqual([2, 0, 0, 0, 0]);
  });

  it("handles one item and a zero total", () => {
    expect(splitLotEvenly(1234, 1)).toEqual([1234]);
    expect(splitLotEvenly(0, 3)).toEqual([0, 0, 0]);
  });

  it("always adds up to the total", () => {
    for (const total of [0, 1, 7, 99, 100, 101, 12_345]) {
      for (const count of [1, 2, 3, 7, 12]) {
        const shares = splitLotEvenly(total, count);
        expect(shares).toHaveLength(count);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBe(total);
      }
    }
  });

  it("rejects a count below 1, fractions and negatives", () => {
    expect(() => splitLotEvenly(100, 0)).toThrow(RangeError);
    expect(() => splitLotEvenly(100, -2)).toThrow(RangeError);
    expect(() => splitLotEvenly(100, 1.5)).toThrow(RangeError);
    expect(() => splitLotEvenly(-100, 2)).toThrow(RangeError);
  });
});

describe("weightedAverageUnitCostCents", () => {
  it("is the unit cost for a single purchase", () => {
    expect(weightedAverageUnitCostCents([{ quantity: 3, unitCostCents: 200 }])).toBe(200);
  });

  it("weights by quantity", () => {
    expect(
      weightedAverageUnitCostCents([
        { quantity: 1, unitCostCents: 100 },
        { quantity: 3, unitCostCents: 500 },
      ]),
    ).toBe(400);
  });

  it("rounds half up to the cent", () => {
    // (100 + 101) / 2 = 100.5
    expect(
      weightedAverageUnitCostCents([
        { quantity: 1, unitCostCents: 100 },
        { quantity: 1, unitCostCents: 101 },
      ]),
    ).toBe(101);
    // (100 + 100 + 101) / 3 = 100.33
    expect(
      weightedAverageUnitCostCents([
        { quantity: 2, unitCostCents: 100 },
        { quantity: 1, unitCostCents: 101 },
      ]),
    ).toBe(100);
  });

  it("is zero with no purchases or no units", () => {
    expect(weightedAverageUnitCostCents([])).toBe(0);
    expect(weightedAverageUnitCostCents([{ quantity: 0, unitCostCents: 500 }])).toBe(0);
  });

  it("handles free items", () => {
    expect(
      weightedAverageUnitCostCents([
        { quantity: 1, unitCostCents: 0 },
        { quantity: 1, unitCostCents: 300 },
      ]),
    ).toBe(150);
  });

  it("rejects negative or fractional values", () => {
    expect(() => weightedAverageUnitCostCents([{ quantity: -1, unitCostCents: 100 }])).toThrow(RangeError);
    expect(() => weightedAverageUnitCostCents([{ quantity: 1, unitCostCents: 1.5 }])).toThrow(RangeError);
  });

  it("averages from SQL sums", () => {
    expect(averageUnitCostCents(1600, 4)).toBe(400);
    expect(averageUnitCostCents(201, 2)).toBe(101);
    expect(averageUnitCostCents(0, 0)).toBe(0);
  });
});
