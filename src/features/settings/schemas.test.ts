import { describe, expect, it } from "vitest";
import { feeRuleInputSchema } from "@/lib/schemas";
import { describeFeeBase, describeFeeTerms, sampleFeeCents } from "./fee-format";
import {
  commissionSchema,
  createCategorySchema,
  feeRuleFormSchema,
  nameFieldSchema,
  setArchivedSchema,
  updateCategorySchema,
} from "./schemas";

const ID_A = "0b0f7a52-58f3-4d0e-9f0e-1f6a1f1d2a01";
const ID_B = "0b0f7a52-58f3-4d0e-9f0e-1f6a1f1d2a02";

describe("nameFieldSchema", () => {
  it("trims and collapses spaces", () => {
    expect(nameFieldSchema.parse("  Blu   ray ")).toBe("Blu ray");
  });

  it("rejects an empty or too long name", () => {
    expect(nameFieldSchema.safeParse("   ").success).toBe(false);
    expect(nameFieldSchema.safeParse("x".repeat(81)).success).toBe(false);
    expect(nameFieldSchema.safeParse("x".repeat(80)).success).toBe(true);
  });
});

describe("category schemas", () => {
  it("reads an empty parent as the top level", () => {
    expect(createCategorySchema.parse({ name: "Games", parentId: "" })).toEqual({ name: "Games", parentId: null });
    expect(createCategorySchema.parse({ name: "Games" })).toEqual({ name: "Games", parentId: null });
  });

  it("keeps a parent id", () => {
    expect(updateCategorySchema.parse({ id: ID_A, name: "Games", parentId: ID_B })).toEqual({
      id: ID_A,
      name: "Games",
      parentId: ID_B,
    });
  });

  it("rejects a parent that is not an id", () => {
    expect(createCategorySchema.safeParse({ name: "Games", parentId: "movie" }).success).toBe(false);
  });

  it("reads the archived flag", () => {
    expect(setArchivedSchema.parse({ id: ID_A, archived: "true" }).archived).toBe(true);
    expect(setArchivedSchema.parse({ id: ID_A, archived: "false" }).archived).toBe(false);
    expect(setArchivedSchema.safeParse({ id: ID_A, archived: "yes" }).success).toBe(false);
  });
});

describe("feeRuleFormSchema", () => {
  const base = { id: "", marketplaceId: ID_A, categoryId: "", percent: "13", fixed: "0.40", paymentPercent: "", paymentFixed: "" };

  it("turns the form into fee rule values", () => {
    const parsed = feeRuleFormSchema.parse({ ...base, appliesToShipping: "on" });
    expect(parsed).toEqual({
      id: null,
      marketplaceId: ID_A,
      categoryId: null,
      percentBps: 1300,
      appliesToShipping: true,
      fixedCents: 40,
      paymentPercentBps: 0,
      paymentFixedCents: 0,
    });
    expect(feeRuleInputSchema.safeParse(parsed).success).toBe(true);
  });

  it("reads an unchecked box, which posts nothing, as false", () => {
    expect(feeRuleFormSchema.parse(base).appliesToShipping).toBe(false);
  });

  it("reads empty amounts as zero", () => {
    const parsed = feeRuleFormSchema.parse({ id: "", marketplaceId: ID_A, categoryId: ID_B, percent: "", fixed: "" });
    expect(parsed).toMatchObject({ categoryId: ID_B, percentBps: 0, fixedCents: 0, paymentPercentBps: 0, paymentFixedCents: 0 });
  });

  it("keeps the id of the rule being edited", () => {
    expect(feeRuleFormSchema.parse({ ...base, id: ID_B }).id).toBe(ID_B);
  });

  it("accepts decimals and a percent sign", () => {
    const parsed = feeRuleFormSchema.parse({ ...base, percent: "12.55%", paymentPercent: "2.9", paymentFixed: "$0.30" });
    expect(parsed).toMatchObject({ percentBps: 1255, paymentPercentBps: 290, paymentFixedCents: 30 });
  });

  it("rejects unreadable amounts on their own field", () => {
    const result = feeRuleFormSchema.safeParse({ ...base, percent: "abc", fixed: "-1" });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("percent");
    expect(paths).toContain("fixed");
  });

  it("rejects a percent over 100", () => {
    expect(feeRuleFormSchema.safeParse({ ...base, percent: "101" }).success).toBe(false);
  });

  it("rejects percentages that add up to 100% or more", () => {
    const result = feeRuleFormSchema.safeParse({ ...base, percent: "60", paymentPercent: "40" });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues.map((issue) => issue.path.join("."))).toEqual(["paymentPercent"]);
    expect(feeRuleFormSchema.safeParse({ ...base, percent: "60", paymentPercent: "39.99" }).success).toBe(true);
  });

  it("needs a marketplace", () => {
    expect(feeRuleFormSchema.safeParse({ ...base, marketplaceId: "" }).success).toBe(false);
  });
});

describe("commissionSchema", () => {
  it("reads a percent and a payee", () => {
    expect(commissionSchema.parse({ percent: "20", payee: " Sam " })).toEqual({
      defaultCommissionBps: 2000,
      defaultCommissionPayee: "Sam",
    });
  });

  it("reads empty fields as null", () => {
    expect(commissionSchema.parse({ percent: "", payee: "" })).toEqual({
      defaultCommissionBps: null,
      defaultCommissionPayee: null,
    });
  });

  it("keeps 0% apart from empty", () => {
    expect(commissionSchema.parse({ percent: "0", payee: "" }).defaultCommissionBps).toBe(0);
  });

  it("rejects more than 100%", () => {
    expect(commissionSchema.safeParse({ percent: "120", payee: "" }).success).toBe(false);
  });
});

describe("fee wording and sample fee", () => {
  const ebay = { percentBps: 1300, appliesToShipping: true, fixedCents: 40, paymentPercentBps: 0, paymentFixedCents: 0 };

  it("reads a rule back", () => {
    expect(describeFeeTerms(ebay)).toBe("13% + $0.40 per order");
    expect(describeFeeTerms({ ...ebay, paymentPercentBps: 290, paymentFixedCents: 30 })).toBe(
      "13% + $0.40 per order, plus 2.9% + $0.30 payment processing",
    );
    expect(describeFeeTerms({ ...ebay, percentBps: 0, fixedCents: 0 })).toBe("No fees");
    expect(describeFeeTerms({ ...ebay, percentBps: 0 })).toBe("$0.40 per order");
  });

  it("says what the percent is charged on, if there is a percent", () => {
    expect(describeFeeBase(ebay)).toBe("Percent applies to item price and shipping");
    expect(describeFeeBase({ ...ebay, appliesToShipping: false })).toBe("Percent applies to item price only");
    expect(describeFeeBase({ ...ebay, percentBps: 0 })).toBeNull();
  });

  it("matches the New listing board: 13% + $0.40 on $44.99 + $5.00 is $6.90", () => {
    expect(sampleFeeCents(ebay, 4499, 500)).toBe(690);
  });

  it("leaves shipping out of the base when the rule says so", () => {
    expect(sampleFeeCents({ ...ebay, appliesToShipping: false }, 2000, 500)).toBe(300);
    expect(sampleFeeCents(ebay, 2000, 500)).toBe(365);
  });

  it("returns null while a value is missing or the percentages reach 100%", () => {
    expect(sampleFeeCents(ebay, null, 500)).toBeNull();
    expect(sampleFeeCents({ ...ebay, percentBps: null }, 2000, 500)).toBeNull();
    expect(sampleFeeCents({ ...ebay, percentBps: 6000, paymentPercentBps: 4000 }, 2000, 500)).toBeNull();
  });
});
