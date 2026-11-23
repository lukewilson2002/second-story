import Papa from "papaparse";
import type { SaleRow } from "./types";

/** Integer cents as a plain decimal for a spreadsheet: 4499 gives "44.99", -690 gives "-6.90". Built from digits, not floats. */
export function centsToCsv(cents: number): string {
  const absolute = Math.abs(cents);
  const sign = cents < 0 ? "-" : "";
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

/** Basis points as a percentage with two decimals: 3120 gives "31.20". Empty for null. */
export function bpsToCsv(bps: number | null): string {
  return bps === null ? "" : centsToCsv(bps);
}

/**
 * Stops a spreadsheet from running a cell as a formula.
 * If the text starts with "=", "+", "-", "@", a tab or a carriage return, it gets a leading apostrophe.
 */
export function csvText(value: string | null): string {
  if (value === null) return "";
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export const SALES_CSV_COLUMNS = [
  "Sold date",
  "Listing",
  "Marketplace",
  "Quantity",
  "Item price",
  "Shipping charged",
  "Revenue",
  "Marketplace fee",
  "Additional fees",
  "Shipping cost",
  "Cost of goods",
  "Profit before commission",
  "Commission",
  "Commission paid to",
  "Commission paid date",
  "Profit",
  "Margin %",
] as const;

/** The sales export: one line per sale, money as plain decimals, dates as YYYY-MM-DD. Lines end with CRLF. */
export function salesCsv(rows: readonly SaleRow[]): string {
  const data = rows.map((row) => [
    row.soldAt,
    csvText(row.listingTitle),
    csvText(row.marketplaceName),
    String(row.quantity),
    centsToCsv(row.salePriceCents),
    centsToCsv(row.shippingChargedCents),
    centsToCsv(row.revenueCents),
    centsToCsv(row.marketplaceFeeCents),
    centsToCsv(row.additionalFeesCents),
    centsToCsv(row.shippingCostCents),
    centsToCsv(row.costOfGoodsCents),
    centsToCsv(row.profitBeforeCommissionCents),
    centsToCsv(row.commissionCents),
    csvText(row.commissionPayee),
    row.commissionPaidAt ?? "",
    centsToCsv(row.profitCents),
    bpsToCsv(row.marginBps),
  ]);
  return Papa.unparse({ fields: [...SALES_CSV_COLUMNS], data }, { newline: "\r\n" });
}
