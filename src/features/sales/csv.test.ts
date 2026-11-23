import Papa from "papaparse";
import { describe, expect, it } from "vitest";
import { bpsToCsv, centsToCsv, csvText, SALES_CSV_COLUMNS, salesCsv } from "./csv";
import type { SaleRow } from "./types";

const sale: SaleRow = {
  id: "s1",
  soldAt: "2026-11-20",
  listingId: "l1",
  listingTitle: 'Zelda, "Ocarina" bundle',
  marketplaceName: "eBay",
  quantity: 1,
  salePriceCents: 4499,
  shippingChargedCents: 500,
  shippingCostCents: 560,
  marketplaceFeeCents: 690,
  additionalFeesCents: 0,
  costOfGoodsCents: 1800,
  commissionCents: 390,
  commissionPayee: "Sam",
  commissionPaidAt: null,
  revenueCents: 4999,
  profitBeforeCommissionCents: 1949,
  profitCents: 1559,
  marginBps: 3119,
};

describe("centsToCsv and bpsToCsv", () => {
  it("writes plain decimals", () => {
    expect(centsToCsv(4499)).toBe("44.99");
    expect(centsToCsv(5)).toBe("0.05");
    expect(centsToCsv(0)).toBe("0.00");
    expect(centsToCsv(-690)).toBe("-6.90");
    expect(centsToCsv(123456789)).toBe("1234567.89");
    expect(bpsToCsv(3119)).toBe("31.19");
    expect(bpsToCsv(null)).toBe("");
  });
});

describe("csvText", () => {
  it("defuses text a spreadsheet would run as a formula", () => {
    expect(csvText("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvText("+1")).toBe("'+1");
    expect(csvText("-1")).toBe("'-1");
    expect(csvText("@cmd")).toBe("'@cmd");
    expect(csvText("Zelda")).toBe("Zelda");
    expect(csvText(null)).toBe("");
  });
});

describe("salesCsv", () => {
  it("writes a header and one line per sale that parses back", () => {
    const loss: SaleRow = { ...sale, id: "s2", listingTitle: "=HYPERLINK(1)", profitCents: -250, marginBps: null, commissionPaidAt: "2026-11-22" };
    const csv = salesCsv([sale, loss]);
    const parsed = Papa.parse<string[]>(csv);
    expect(parsed.errors).toEqual([]);
    expect(parsed.data[0]).toEqual([...SALES_CSV_COLUMNS]);
    expect(parsed.data[1]).toEqual([
      "2026-11-20",
      'Zelda, "Ocarina" bundle',
      "eBay",
      "1",
      "44.99",
      "5.00",
      "49.99",
      "6.90",
      "0.00",
      "5.60",
      "18.00",
      "19.49",
      "3.90",
      "Sam",
      "",
      "15.59",
      "31.19",
    ]);
    expect(parsed.data[2]?.[1]).toBe("'=HYPERLINK(1)");
    expect(parsed.data[2]?.[14]).toBe("2026-11-22");
    expect(parsed.data[2]?.[15]).toBe("-2.50");
    expect(parsed.data[2]?.[16]).toBe("");
    expect(parsed.data).toHaveLength(3);
  });

  it("writes only the header when there are no sales", () => {
    expect(salesCsv([]).trim()).toBe(SALES_CSV_COLUMNS.join(","));
  });
});
