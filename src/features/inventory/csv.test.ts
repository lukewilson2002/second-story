import { describe, expect, it } from "vitest";
import type { CategoryRecord } from "@/lib/domain/categories";
import {
  buildCategoryLookup,
  guessMapping,
  isBlankRow,
  mapCsvRow,
  parseCsvDate,
  validateMapping,
  type ColumnMapping,
  type MapRowOptions,
} from "./csv";
import { importRowSchema } from "./schemas";

const BOOK = "11111111-1111-4111-8111-111111111111";
const MOVIE = "22222222-2222-4222-8222-222222222222";
const DVD = "33333333-3333-4333-8333-333333333333";
const GAMES = "44444444-4444-4444-8444-444444444444";
const GAMES_DVD = "55555555-5555-4555-8555-555555555555";
const OLD = "66666666-6666-4666-8666-666666666666";

const categories: CategoryRecord[] = [
  { id: BOOK, parentId: null, name: "Book", archived: false },
  { id: MOVIE, parentId: null, name: "Movie", archived: false },
  { id: DVD, parentId: MOVIE, name: "DVD", archived: false },
  { id: GAMES, parentId: null, name: "Games", archived: false },
  { id: GAMES_DVD, parentId: GAMES, name: "DVD", archived: false },
  { id: OLD, parentId: null, name: "Old stuff", archived: true },
];

const options: MapRowOptions = {
  categoryLookup: buildCategoryLookup(categories),
  defaultCategoryId: null,
  defaultPurchasedAt: "2026-11-23",
  dateOrder: "mdy",
};

describe("guessMapping", () => {
  it("guesses common header names", () => {
    expect(guessMapping(["Item Name", "Category", "Qty", "Cost", "Date Purchased", "Store", "UPC", "Bin", "Notes", "Profit"])).toEqual([
      "title",
      "category",
      "quantity",
      "unitCost",
      "purchasedAt",
      "source",
      "identifier:upc",
      "storageLocation",
      "notes",
      null,
    ]);
  });

  it("uses each target once and reads ISBN as ISBN-13", () => {
    expect(guessMapping(["Title", "Name", "ISBN", "isbn_10", "Total Cost"])).toEqual([
      "title",
      null,
      "identifier:isbn13",
      "identifier:isbn10",
      "totalCost",
    ]);
  });
});

describe("validateMapping", () => {
  it("needs a title column", () => {
    expect(validateMapping([null, "quantity"])).toEqual(["Pick the column that holds the item title."]);
  });

  it("refuses a target mapped twice, and unit cost with total cost", () => {
    expect(validateMapping(["title", "title"])).toHaveLength(1);
    expect(validateMapping(["title", "unitCost", "totalCost"])).toEqual(["Map either Unit cost or Total cost, not both."]);
    expect(validateMapping(["title", "unitCost", null])).toEqual([]);
  });
});

describe("parseCsvDate", () => {
  it("reads the common formats", () => {
    expect(parseCsvDate("2026-11-14")).toBe("2026-11-14");
    expect(parseCsvDate("2026-11-14 09:30:00")).toBe("2026-11-14");
    expect(parseCsvDate("11/14/2026")).toBe("2026-11-14");
    expect(parseCsvDate("3/4/26")).toBe("2026-03-04");
    expect(parseCsvDate("3/4/26", "dmy")).toBe("2026-04-03");
    expect(parseCsvDate("14.11.2026", "dmy")).toBe("2026-11-14");
    expect(parseCsvDate("Nov 14, 2026")).toBe("2026-11-14");
    expect(parseCsvDate("November 14th 2026")).toBe("2026-11-14");
    expect(parseCsvDate("14 Nov 2026")).toBe("2026-11-14");
  });

  it("returns null for dates that do not exist or cannot be read", () => {
    expect(parseCsvDate("2/30/2026")).toBeNull();
    expect(parseCsvDate("14/11/2026")).toBeNull();
    expect(parseCsvDate("last week")).toBeNull();
    expect(parseCsvDate("")).toBeNull();
    expect(parseCsvDate("Foo 14, 2026")).toBeNull();
  });
});

describe("buildCategoryLookup", () => {
  const lookup = buildCategoryLookup(categories);

  it("finds a category by a unique name or by its path, with any separator", () => {
    expect(lookup.get("book")).toBe(BOOK);
    expect(lookup.get("movie>dvd")).toBe(DVD);
    expect(lookup.get("games>dvd")).toBe(GAMES_DVD);
  });

  it("does not guess between two categories with the same name, and skips archived ones", () => {
    expect(lookup.get("dvd")).toBeUndefined();
    expect(lookup.get("old stuff")).toBeUndefined();
  });
});

describe("mapCsvRow", () => {
  const mapping: ColumnMapping = [
    "title",
    "category",
    "quantity",
    "unitCost",
    "purchasedAt",
    "source",
    "identifier:upc",
    null,
    "notes",
  ];

  it("maps a full row into an item and its first purchase", () => {
    const result = mapCsvRow(
      [" The Matrix ", "Movie / DVD", "4", "$0.75", "9/20/2026", "Goodwill", "0-85391-73732-2", "ignored", ""],
      mapping,
      options,
    );
    expect(result).toEqual({
      ok: true,
      notes: [],
      row: {
        title: "The Matrix",
        categoryId: DVD,
        condition: null,
        storageLocation: null,
        description: null,
        notes: null,
        quantity: 4,
        unitCostCents: 75,
        purchasedAt: "2026-09-20",
        source: "Goodwill",
        identifiers: [{ type: "upc", value: "085391737322" }],
      },
    });
    if (result.ok) expect(importRowSchema.safeParse(result.row).success).toBe(true);
  });

  it("uses the defaults for a blank quantity, cost, date and category", () => {
    const result = mapCsvRow(["Dune", "", "", "", "", "", "", "", ""], mapping, { ...options, defaultCategoryId: BOOK });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.row).toMatchObject({ categoryId: BOOK, quantity: 1, unitCostCents: 0, purchasedAt: "2026-11-23", identifiers: [] });
    expect(result.notes).toEqual(["No cost, using $0.00"]);
  });

  it("falls back to the default category for an unknown one, and says so", () => {
    const result = mapCsvRow(["Lamp", "Home goods", "1", "2", "", "", "", "", ""], mapping, { ...options, defaultCategoryId: BOOK });
    expect(result.ok && result.row.categoryId).toBe(BOOK);
    expect(result.ok && result.notes).toEqual(['Category "Home goods" not found, using the default']);
  });

  it("fails a row with an unknown category when there is no default", () => {
    expect(mapCsvRow(["Lamp", "Home goods", "1", "2", "", "", "", "", ""], mapping, options)).toEqual({
      ok: false,
      title: "Lamp",
      errors: ['Category "Home goods" does not exist'],
    });
  });

  it("collects every problem in a row", () => {
    const result = mapCsvRow(["", "Book", "two", "-5", "soon", "", "", "", ""], mapping, options);
    expect(result).toEqual({
      ok: false,
      title: "",
      errors: [
        "No title",
        'Quantity "two" is not a whole number of 1 or more',
        'Unit cost "-5" is not an amount',
        'Purchase date "soon" is not a date',
      ],
    });
  });

  it("refuses a quantity of zero", () => {
    const result = mapCsvRow(["Dune", "Book", "0", "1", "", "", "", "", ""], mapping, options);
    expect(result.ok).toBe(false);
  });

  it("divides a total cost by the quantity, rounding half up", () => {
    const totalMapping: ColumnMapping = ["title", "category", "quantity", "totalCost"];
    const even = mapCsvRow(["Dune", "Book", "3", "9.00"], totalMapping, options);
    expect(even.ok && even.row.unitCostCents).toBe(300);
    expect(even.ok && even.notes).toEqual([]);
    const uneven = mapCsvRow(["Dune", "Book", "3", "$10.00"], totalMapping, options);
    expect(uneven.ok && uneven.row.unitCostCents).toBe(333);
    expect(uneven.ok && uneven.notes).toEqual(["Total cost does not divide evenly, unit cost rounded"]);
  });

  it("reads several identifier columns and drops ones with no usable characters", () => {
    const result = mapCsvRow(["Dune", "Book", "978-0-441-01359-3", "n/a", "b0abc12345"], ["title", "category", "identifier:isbn13", "identifier:upc", "identifier:asin"], options);
    expect(result.ok && result.row.identifiers).toEqual([
      { type: "isbn13", value: "9780441013593" },
      { type: "asin", value: "B0ABC12345" },
    ]);
    expect(result.ok && result.notes).toEqual(["No cost, using $0.00", 'UPC "n/a" has no usable characters, left out']);
  });

  it("treats a short row as blank cells", () => {
    const result = mapCsvRow(["Dune", "Book"], mapping, options);
    expect(result.ok && result.row.quantity).toBe(1);
  });
});

describe("isBlankRow", () => {
  it("spots rows with only blank cells", () => {
    expect(isBlankRow(["", "  ", ""])).toBe(true);
    expect(isBlankRow(["", "x"])).toBe(false);
  });
});
