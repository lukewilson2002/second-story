import { averageUnitCostCents } from "@/lib/calc";
import { buildCategoryTree, flattenCategoryTree, type CategoryRecord } from "@/lib/domain/categories";
import { parseDollarsToCents } from "@/lib/format";
import { IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS, MAX_INT, normalizeIdentifier, type IdentifierType } from "@/lib/schemas";
import type { ImportRow } from "./schemas";

/**
 * CSV import mapping. Pure functions, used by the import screen in the browser and by unit tests.
 * The spreadsheet's columns are not known ahead of time, so each column is mapped by hand to one of these targets.
 */

export type ImportTarget =
  | "title"
  | "category"
  | "condition"
  | "quantity"
  | "unitCost"
  | "totalCost"
  | "purchasedAt"
  | "source"
  | "storageLocation"
  | "description"
  | "notes"
  | `identifier:${IdentifierType}`;

export interface ImportTargetOption {
  value: ImportTarget;
  label: string;
  group: "Item" | "Purchase" | "Identifiers";
}

export const IMPORT_TARGETS: readonly ImportTargetOption[] = [
  { value: "title", label: "Title", group: "Item" },
  { value: "category", label: "Category", group: "Item" },
  { value: "condition", label: "Condition", group: "Item" },
  { value: "storageLocation", label: "Storage location", group: "Item" },
  { value: "description", label: "Description", group: "Item" },
  { value: "notes", label: "Notes", group: "Item" },
  { value: "quantity", label: "Quantity", group: "Purchase" },
  { value: "unitCost", label: "Unit cost", group: "Purchase" },
  { value: "totalCost", label: "Total cost (for all units)", group: "Purchase" },
  { value: "purchasedAt", label: "Purchase date", group: "Purchase" },
  { value: "source", label: "Source", group: "Purchase" },
  ...IDENTIFIER_TYPES.map(
    (type): ImportTargetOption => ({ value: `identifier:${type}`, label: IDENTIFIER_TYPE_LABELS[type], group: "Identifiers" }),
  ),
];

const TARGET_VALUES = new Set<string>(IMPORT_TARGETS.map((target) => target.value));

export function isImportTarget(value: string): value is ImportTarget {
  return TARGET_VALUES.has(value);
}

export function importTargetLabel(target: ImportTarget): string {
  return IMPORT_TARGETS.find((option) => option.value === target)?.label ?? target;
}

/** One entry per CSV column, in column order. Null means the column is not imported. */
export type ColumnMapping = (ImportTarget | null)[];

/** Header words that suggest a target. The first target in this list that fits a header wins. */
const HEADER_HINTS: readonly [ImportTarget, RegExp][] = [
  ["identifier:isbn13", /^isbn\s*-?\s*13$/],
  ["identifier:isbn10", /^isbn\s*-?\s*10$/],
  ["identifier:isbn13", /^isbn$/],
  ["identifier:upc", /^(upc|barcode|bar code)$/],
  ["identifier:ean", /^ean$/],
  ["identifier:asin", /^asin$/],
  ["identifier:sku", /^sku$/],
  ["title", /^(title|item|item name|name|product|product name)$/],
  ["category", /^(category|type|department)$/],
  ["condition", /^(condition|cond|grade)$/],
  ["quantity", /^(quantity|qty|count|units|on hand|stock)$/],
  ["totalCost", /^(total cost|total paid|total|lot cost|total price)$/],
  ["unitCost", /^(unit cost|cost|cost each|price paid|paid|purchase price|buy price|cogs|cost per unit)$/],
  ["purchasedAt", /^(purchase date|purchased|purchased at|date purchased|date bought|bought|buy date|date)$/],
  ["source", /^(source|store|bought at|bought from|purchased from|where|vendor|seller)$/],
  ["storageLocation", /^(location|storage|storage location|bin|shelf)$/],
  ["description", /^(description|desc|details)$/],
  ["notes", /^(notes|note|comments|comment)$/],
];

function normalizeHeader(header: string): string {
  return header
    .trim()
    .toLowerCase()
    .replace(/[_./#]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * A first guess at the mapping from the header names. It is only a starting point for the person to correct.
 * Each target is used once. If two headers fit the same target, the first column gets it.
 */
export function guessMapping(headers: readonly string[]): ColumnMapping {
  const used = new Set<ImportTarget>();
  return headers.map((header) => {
    const normalized = normalizeHeader(header);
    for (const [target, pattern] of HEADER_HINTS) {
      if (!used.has(target) && pattern.test(normalized)) {
        used.add(target);
        return target;
      }
    }
    return null;
  });
}

/**
 * Checks a mapping before any rows are read. Returns messages for the person, or an empty list if it is usable.
 * A title column is required. A target can be mapped once. Unit cost and total cost cannot both be mapped.
 */
export function validateMapping(mapping: ColumnMapping): string[] {
  const errors: string[] = [];
  const counts = new Map<ImportTarget, number>();
  for (const target of mapping) {
    if (target) counts.set(target, (counts.get(target) ?? 0) + 1);
  }
  if (!counts.has("title")) errors.push("Pick the column that holds the item title.");
  for (const [target, count] of counts) {
    if (count > 1) errors.push(`"${importTargetLabel(target)}" is mapped to ${count} columns. Map it to one.`);
  }
  if (counts.has("unitCost") && counts.has("totalCost")) {
    errors.push("Map either Unit cost or Total cost, not both.");
  }
  return errors;
}

/** Whether "3/4/2026" means March 4 or April 3. */
export type DateOrder = "mdy" | "dmy";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  // Date.UTC rolls an impossible date over (Feb 30 becomes Mar 2), so the parts are checked on the way back.
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  if (year < 1900 || year > 2200) return null;
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fullYear(text: string): number {
  // Two-digit years are read as 2000 to 2099. A resale spreadsheet does not reach back further.
  return text.length <= 2 ? 2000 + Number(text) : Number(text);
}

/**
 * Reads a date from a spreadsheet cell and returns "YYYY-MM-DD", or null if it cannot be read.
 * Accepts "2026-11-14", "11/14/2026", "11/14/26", "14.11.2026" (with `dmy`), "Nov 14, 2026" and "14 Nov 2026".
 * A time after the date is ignored.
 */
export function parseCsvDate(value: string, order: DateOrder = "mdy"): string | null {
  const text = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(text);
  if (iso) return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const numeric = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/.exec(text);
  if (numeric) {
    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    const year = fullYear(numeric[3] ?? "");
    return order === "mdy" ? toIsoDate(year, first, second) : toIsoDate(year, second, first);
  }
  const monthFirst = /^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/.exec(text);
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/.exec(text);
  const named = monthFirst
    ? { month: monthFirst[1], day: monthFirst[2], year: monthFirst[3] }
    : dayFirst
      ? { month: dayFirst[2], day: dayFirst[1], year: dayFirst[3] }
      : null;
  if (named) {
    const month = MONTHS.indexOf((named.month ?? "").slice(0, 3).toLowerCase()) + 1;
    return month === 0 ? null : toIsoDate(Number(named.year), month, Number(named.day));
  }
  return null;
}

function categoryKey(text: string): string {
  return text
    .split(/[›>/\\|:]+/)
    .map((part) => part.trim().toLowerCase().replace(/\s+/g, " "))
    .filter(Boolean)
    .join(">");
}

/**
 * Builds the lookup from what a spreadsheet cell says to a category id.
 * A full path always works ("Movie › DVD", "Movie > DVD", "Movie/DVD").
 * A name alone works if only one category has that name. Archived categories are left out.
 */
export function buildCategoryLookup(categories: readonly CategoryRecord[]): Map<string, string> {
  const nodes = flattenCategoryTree(buildCategoryTree(categories, { includeArchived: false }));
  const lookup = new Map<string, string>();
  const nameCounts = new Map<string, number>();
  for (const node of nodes) {
    const name = categoryKey(node.name);
    nameCounts.set(name, (nameCounts.get(name) ?? 0) + 1);
  }
  for (const node of nodes) {
    const name = categoryKey(node.name);
    if (nameCounts.get(name) === 1) lookup.set(name, node.id);
  }
  // Paths go in last, so a top-level category wins over a same-named sub-category elsewhere.
  for (const node of nodes) lookup.set(categoryKey(node.path.join(">")), node.id);
  return lookup;
}

export interface MapRowOptions {
  categoryLookup: ReadonlyMap<string, string>;
  /** Used if the row has no category, or one that is not in the lookup. Null makes those rows fail. */
  defaultCategoryId: string | null;
  /** Used if the row has no purchase date. "YYYY-MM-DD". */
  defaultPurchasedAt: string;
  dateOrder: DateOrder;
}

export type MappedRow =
  | { ok: true; row: ImportRow; notes: string[] }
  | { ok: false; errors: string[]; title: string };

function parseQuantity(text: string): number | null {
  const cleaned = text.replace(/,/g, "");
  if (!/^\d+(\.0+)?$/.test(cleaned)) return null;
  const quantity = Number.parseInt(cleaned, 10);
  return quantity >= 1 && quantity <= 1_000_000 ? quantity : null;
}

/**
 * Turns one CSV row into an item with its first purchase, using the column mapping.
 * Problems that stop the row from being imported come back as `errors`. Things the person should know about, like a default being used, come back as `notes`.
 *
 * - A blank quantity is 1. A blank cost is $0.00.
 * - If a total cost is mapped, the unit cost is the total divided by the quantity, rounded half up to the cent.
 * - If the category is blank or unknown, the default category is used.
 * - If the purchase date is blank, the default date is used. A date that cannot be read is an error.
 */
export function mapCsvRow(cells: readonly string[], mapping: ColumnMapping, options: MapRowOptions): MappedRow {
  const values = new Map<ImportTarget, string>();
  mapping.forEach((target, index) => {
    if (target && !values.has(target)) values.set(target, (cells[index] ?? "").trim());
  });
  const text = (target: ImportTarget): string => values.get(target) ?? "";
  const optional = (target: ImportTarget): string | null => text(target) || null;

  const errors: string[] = [];
  const notes: string[] = [];

  const title = text("title");
  if (title === "") errors.push("No title");
  if (title.length > 500) errors.push("Title is longer than 500 characters");

  let quantity = 1;
  if (text("quantity") !== "") {
    const parsed = parseQuantity(text("quantity"));
    if (parsed === null) errors.push(`Quantity "${text("quantity")}" is not a whole number of 1 or more`);
    else quantity = parsed;
  }

  let unitCostCents = 0;
  if (text("totalCost") !== "") {
    const total = parseDollarsToCents(text("totalCost"));
    if (total === null) errors.push(`Total cost "${text("totalCost")}" is not an amount`);
    else {
      unitCostCents = averageUnitCostCents(total, quantity);
      if (unitCostCents * quantity !== total) notes.push("Total cost does not divide evenly, unit cost rounded");
    }
  } else if (text("unitCost") !== "") {
    const cost = parseDollarsToCents(text("unitCost"));
    if (cost === null) errors.push(`Unit cost "${text("unitCost")}" is not an amount`);
    else unitCostCents = cost;
  } else {
    notes.push("No cost, using $0.00");
  }
  if (unitCostCents > MAX_INT || unitCostCents * quantity > MAX_INT) errors.push("The cost is too large");

  let categoryId = options.defaultCategoryId;
  const categoryText = text("category");
  const matched = categoryText === "" ? undefined : options.categoryLookup.get(categoryKey(categoryText));
  if (matched) {
    categoryId = matched;
  } else if (categoryId === null) {
    errors.push(categoryText === "" ? "No category" : `Category "${categoryText}" does not exist`);
  } else if (categoryText !== "") {
    notes.push(`Category "${categoryText}" not found, using the default`);
  }

  let purchasedAt = options.defaultPurchasedAt;
  if (text("purchasedAt") !== "") {
    const parsed = parseCsvDate(text("purchasedAt"), options.dateOrder);
    if (parsed === null) errors.push(`Purchase date "${text("purchasedAt")}" is not a date`);
    else purchasedAt = parsed;
  }

  const identifiers: ImportRow["identifiers"] = [];
  for (const type of IDENTIFIER_TYPES) {
    const raw = text(`identifier:${type}`);
    if (raw === "") continue;
    const value = normalizeIdentifier(type, raw);
    if (value === "") notes.push(`${IDENTIFIER_TYPE_LABELS[type]} "${raw}" has no usable characters, left out`);
    else identifiers.push({ type, value });
  }

  if (errors.length > 0 || categoryId === null) return { ok: false, errors, title };
  return {
    ok: true,
    notes,
    row: {
      title,
      categoryId,
      condition: optional("condition"),
      storageLocation: optional("storageLocation"),
      description: optional("description"),
      notes: optional("notes"),
      quantity,
      unitCostCents,
      purchasedAt,
      source: optional("source"),
      identifiers,
    },
  };
}

/** True if every cell in a row is blank. Spreadsheets often end with empty rows. */
export function isBlankRow(cells: readonly string[]): boolean {
  return cells.every((cell) => cell.trim() === "");
}
