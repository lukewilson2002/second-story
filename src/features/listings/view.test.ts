import { describe, expect, it } from "vitest";
import { NO_FEES } from "@/lib/calc";
import type { ListingRow } from "./types";
import { describeFeeRule, filterListingRows } from "./view";

describe("describeFeeRule", () => {
  it("matches the wording on the listing board", () => {
    expect(describeFeeRule({ ...NO_FEES, percentBps: 1300, fixedCents: 40, appliesToShipping: true })).toBe(
      "13% of item price plus shipping, and $0.40 per order.",
    );
  });

  it("adds the payment percent and fixed fee in", () => {
    expect(
      describeFeeRule({ percentBps: 1000, appliesToShipping: false, fixedCents: 0, paymentPercentBps: 290, paymentFixedCents: 30 }),
    ).toBe("12.9% of item price, and $0.30 per order.");
  });

  it("handles a percent only, a fixed fee only, no fees and no rule", () => {
    expect(describeFeeRule({ ...NO_FEES, percentBps: 500, appliesToShipping: true })).toBe("5% of item price plus shipping.");
    expect(describeFeeRule({ ...NO_FEES, fixedCents: 100 })).toBe("$1.00 per order.");
    expect(describeFeeRule(NO_FEES)).toBe("No fees.");
    expect(describeFeeRule(null)).toBe("No fee rule yet, so no fees are counted.");
  });
});

function row(overrides: Partial<ListingRow>): ListingRow {
  return {
    id: "a",
    title: "Zelda bundle",
    status: "active",
    marketplaces: [{ marketplaceId: "m", name: "eBay", status: "active", externalUrl: null }],
    askingPriceCents: 4499,
    minimumPriceCents: 2259,
    belowMinimum: false,
    daysListed: 3,
    quantity: 1,
    soldQuantity: 0,
    stale: false,
    stillUpCount: 0,
    ...overrides,
  };
}

describe("filterListingRows", () => {
  const rows = [
    row({ id: "ok" }),
    row({ id: "low", title: "Cheap DVD", belowMinimum: true }),
    row({ id: "old", title: "Old book", stale: true }),
    row({ id: "sold", status: "sold" }),
    row({ id: "up", status: "sold", stillUpCount: 1 }),
    row({ id: "draft", status: "draft" }),
  ];
  const ids = (tab: ListingRow["status"], filter: Parameters<typeof filterListingRows>[1]["filter"], search = "") =>
    filterListingRows(rows, { tab, filter, search }).map((item) => item.id);

  it("shows one status per tab", () => {
    expect(ids("active", null)).toEqual(["ok", "low", "old"]);
    expect(ids("sold", null)).toEqual(["sold", "up"]);
    expect(ids("draft", null)).toEqual(["draft"]);
    expect(ids("ended", null)).toEqual([]);
  });

  it("applies the needs-attention filters", () => {
    expect(ids("active", "below-minimum")).toEqual(["low"]);
    expect(ids("active", "stale")).toEqual(["old"]);
    expect(ids("sold", "still-up")).toEqual(["up"]);
  });

  it("searches the title and marketplace names without case", () => {
    expect(ids("active", null, " dvd ")).toEqual(["low"]);
    expect(ids("active", null, "EBAY")).toEqual(["ok", "low", "old"]);
    expect(ids("active", null, "nothing")).toEqual([]);
  });
});
