import { describe, expect, it } from "vitest";
import { recordSaleInputSchema } from "@/lib/schemas";
import { markSoldFormSchema, parseSalesFilter } from "./schemas";

const LISTING = "11111111-1111-4111-8111-111111111111";
const MARKET = "33333333-3333-4333-8333-333333333333";

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    listingId: LISTING,
    marketplaceId: MARKET,
    soldAt: "2026-11-20",
    salePrice: "$40.00",
    shippingCost: "5.60",
    additionalFees: "",
    ...overrides,
  };
}

describe("markSoldFormSchema", () => {
  it("turns the posted text into the input recordSale takes", () => {
    const parsed = markSoldFormSchema.parse(form());
    expect(parsed).toEqual({
      listingId: LISTING,
      marketplaceId: MARKET,
      soldAt: "2026-11-20",
      quantity: 1,
      salePriceCents: 4000,
      shippingCostCents: 560,
      additionalFeesCents: 0,
    });
    expect(recordSaleInputSchema.safeParse(parsed).success).toBe(true);
  });

  it("leaves the fee out when the field is empty or missing, so the fee rule applies", () => {
    expect("marketplaceFeeCents" in markSoldFormSchema.parse(form())).toBe(false);
    expect("marketplaceFeeCents" in markSoldFormSchema.parse(form({ marketplaceFee: "  " }))).toBe(false);
  });

  it("keeps a typed fee, including a fee of 0", () => {
    expect(markSoldFormSchema.parse(form({ marketplaceFee: "6.90" })).marketplaceFeeCents).toBe(690);
    expect(markSoldFormSchema.parse(form({ marketplaceFee: "0" })).marketplaceFeeCents).toBe(0);
  });

  it("reads the quantity", () => {
    expect(markSoldFormSchema.parse(form({ quantity: "3" })).quantity).toBe(3);
  });

  it("rejects a missing price, a bad fee, a bad date, a zero quantity and a missing marketplace", () => {
    const paths = (input: Record<string, string>) => {
      const result = markSoldFormSchema.safeParse(input);
      return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    };
    expect(paths(form({ salePrice: "" }))).toEqual(["salePrice"]);
    expect(paths(form({ marketplaceFee: "abc" }))).toEqual(["marketplaceFee"]);
    expect(paths(form({ soldAt: "2026-02-30" }))).toEqual(["soldAt"]);
    expect(paths(form({ quantity: "0" }))).toEqual(["quantity"]);
    expect(paths(form({ marketplaceId: "" }))).toEqual(["marketplaceId"]);
  });
});

describe("parseSalesFilter", () => {
  it("reads the dashboard's commission-owed link and ignores anything else", () => {
    expect(parseSalesFilter("commission-owed")).toBe("commission-owed");
    expect(parseSalesFilter(undefined)).toBe("all");
    expect(parseSalesFilter("nope")).toBe("all");
  });
});
