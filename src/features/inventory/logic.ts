import { splitLotEvenly } from "@/lib/calc";
import { daysBetween } from "@/lib/format";
import { normalizeIdentifier, type IdentifierType, type ItemStatus } from "@/lib/schemas";

/**
 * Pure inventory rules: no database, no React. Safe to import from Server and Client Components.
 */

export interface IdentifierValue {
  type: IdentifierType;
  /** Already normalized with `normalizeIdentifier`. */
  value: string;
}

/**
 * The form of a title used to spot duplicates.
 * Case, leading and trailing spaces, and runs of spaces are ignored, so "Dune,  Hardcover " matches "dune, hardcover".
 * `findDuplicateItems` applies the same rule in SQL.
 */
export function normalizeTitleForMatch(title: string): string {
  return title.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Normalizes identifiers and drops blanks and repeats.
 * The table allows one identifier of a type and value per item, so repeats must go before an insert.
 */
export function cleanIdentifiers(identifiers: readonly { type: IdentifierType; value: string }[]): IdentifierValue[] {
  const seen = new Set<string>();
  const result: IdentifierValue[] = [];
  for (const identifier of identifiers) {
    const value = normalizeIdentifier(identifier.type, identifier.value);
    const key = `${identifier.type}:${value}`;
    if (value === "" || seen.has(key)) continue;
    seen.add(key);
    result.push({ type: identifier.type, value });
  }
  return result;
}

/**
 * The stored values that count as a match for these identifiers.
 * The type is ignored, because the same barcode is often saved as UPC on one item and EAN on another.
 * A 12-digit UPC also matches its 13-digit EAN form (a leading zero), and the other way round.
 */
export function identifierMatchValues(identifiers: readonly IdentifierValue[]): string[] {
  const values = new Set<string>();
  for (const { value } of cleanIdentifiers(identifiers)) {
    values.add(value);
    if (/^\d{12}$/.test(value)) values.add(`0${value}`);
    if (/^0\d{12}$/.test(value)) values.add(value.slice(1));
  }
  return [...values];
}

/**
 * The cost of each item in a lot bought for one price.
 * Each line of a lot is one unit, so its share is its unit cost and the shares always add up to the total.
 * If the split leaves a remainder, the extra cents go to the first item.
 */
export function lotUnitCosts(totalCostCents: number, lineCount: number): number[] {
  return splitLotEvenly(totalCostCents, lineCount);
}

/** Moves one id up (-1) or down (+1) in a list. Returns the same order if the move would leave the list. */
export function moveInList(ids: readonly string[], id: string, delta: -1 | 1): string[] {
  const from = ids.indexOf(id);
  const to = from + delta;
  const moving = ids[from];
  const swapped = ids[to];
  if (from < 0 || moving === undefined || swapped === undefined) return [...ids];
  const next = [...ids];
  next[from] = swapped;
  next[to] = moving;
  return next;
}

/**
 * Days since the item was last bought, as on the inventory board.
 * Returns null if nothing is on hand or there is no purchase, which the table shows as a dash.
 */
export function daysHeld(input: { quantityOnHand: number; lastPurchasedAt: string | null; today: string }): number | null {
  if (input.quantityOnHand <= 0 || input.lastPurchasedAt === null) return null;
  const days = daysBetween(input.lastPurchasedAt, input.today);
  return days === null ? null : Math.max(0, days);
}

export interface InventoryRow {
  id: string;
  title: string;
  categoryId: string;
  /** The item's own category name, for the thumbnail code. */
  categoryName: string;
  /** "Movie › DVD". */
  categoryPath: string;
  /** The top-level category id, so sub-categories share a thumbnail colour. */
  toneKey: string;
  quantity: number;
  avgUnitCostCents: number;
  lastPurchasedAt: string | null;
  status: ItemStatus;
  daysHeld: number | null;
  /** Normalized identifier values, for search. */
  identifiers: string[];
  thumbnailUrl: string | null;
}

export interface InventoryFilter {
  query: string;
  /** Null for every category. Otherwise the picked category and its descendants. */
  categoryIds: ReadonlySet<string> | null;
  status: ItemStatus | "all";
}

/**
 * Filters inventory rows by search text, category and status.
 * The search matches a title that contains the text, or an identifier that contains it once spaces and hyphens are removed,
 * so "978-0-441-01359-3" finds the stored "9780441013593" and "bin7" finds the SKU "BIN-7".
 */
export function filterInventoryRows<T extends Pick<InventoryRow, "title" | "categoryId" | "status" | "identifiers">>(
  rows: readonly T[],
  filter: InventoryFilter,
): T[] {
  const text = normalizeTitleForMatch(filter.query);
  const compact = filter.query.replace(/[\s-]/g, "").toUpperCase();
  return rows.filter((row) => {
    if (filter.status !== "all" && row.status !== filter.status) return false;
    if (filter.categoryIds && !filter.categoryIds.has(row.categoryId)) return false;
    if (text === "") return true;
    if (normalizeTitleForMatch(row.title).includes(text)) return true;
    if (compact === "") return false;
    // A SKU can hold hyphens of its own, so the stored value is compared with and without them.
    return row.identifiers.some((value) => value.toUpperCase().replace(/[\s-]/g, "").includes(compact));
  });
}

/** The totals in the inventory page description: items, units on hand and what those units cost. */
export function inventoryTotals(rows: readonly Pick<InventoryRow, "quantity" | "avgUnitCostCents">[]): {
  items: number;
  units: number;
  costCents: number;
} {
  let units = 0;
  let costCents = 0;
  for (const row of rows) {
    units += row.quantity;
    costCents += row.quantity * row.avgUnitCostCents;
  }
  return { items: rows.length, units, costCents };
}
