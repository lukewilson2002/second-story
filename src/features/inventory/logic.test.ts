import { describe, expect, it } from "vitest";
import { buildUploadSignature, isOwnPublicId, photoFolder, signCloudinaryParams } from "./cloudinary-sign";
import {
  cleanIdentifiers,
  daysHeld,
  filterInventoryRows,
  identifierMatchValues,
  inventoryTotals,
  lotUnitCosts,
  moveInList,
  normalizeTitleForMatch,
} from "./logic";
import { addStockFormSchema, createItemFormSchema, createLotFormSchema } from "./schemas";

describe("identifier normalization", () => {
  it("keeps digits only for UPC, EAN and ISBN-13", () => {
    expect(
      cleanIdentifiers([
        { type: "upc", value: " 0 85391-73732 2 " },
        { type: "ean", value: "50-12345-67890-0" },
        { type: "isbn13", value: "978-0-441-01359-3" },
      ]),
    ).toEqual([
      { type: "upc", value: "085391737322" },
      { type: "ean", value: "5012345678900" },
      { type: "isbn13", value: "9780441013593" },
    ]);
  });

  it("keeps a final X on an ISBN-10 and uppercases an ASIN", () => {
    expect(
      cleanIdentifiers([
        { type: "isbn10", value: "0-8044-2957-x" },
        { type: "asin", value: " b0abc12345 " },
        { type: "sku", value: "  Shelf-A1/7 " },
      ]),
    ).toEqual([
      { type: "isbn10", value: "080442957X" },
      { type: "asin", value: "B0ABC12345" },
      { type: "sku", value: "Shelf-A1/7" },
    ]);
  });

  it("drops blanks and repeats of the same type and value", () => {
    expect(
      cleanIdentifiers([
        { type: "upc", value: "085391737322" },
        { type: "upc", value: "0853-9173-7322" },
        { type: "upc", value: "---" },
        { type: "ean", value: "085391737322" },
      ]),
    ).toEqual([
      { type: "upc", value: "085391737322" },
      { type: "ean", value: "085391737322" },
    ]);
  });

  it("matches a UPC against its EAN form and back", () => {
    expect(identifierMatchValues([{ type: "upc", value: "085391737322" }]).sort()).toEqual(["0085391737322", "085391737322"]);
    expect(identifierMatchValues([{ type: "ean", value: "0085391737322" }]).sort()).toEqual(["0085391737322", "085391737322"]);
    expect(identifierMatchValues([{ type: "isbn13", value: "9780441013593" }])).toEqual(["9780441013593"]);
  });
});

describe("title matching", () => {
  it("ignores case and extra spaces", () => {
    expect(normalizeTitleForMatch("  Dune,   Hardcover ")).toBe("dune, hardcover");
    expect(normalizeTitleForMatch("\tThe\nMatrix")).toBe("the matrix");
  });
});

describe("lot split", () => {
  it("splits evenly when the total divides", () => {
    expect(lotUnitCosts(900, 3)).toEqual([300, 300, 300]);
  });

  it("puts the remainder cents on the first item", () => {
    expect(lotUnitCosts(1000, 3)).toEqual([334, 333, 333]);
    expect(lotUnitCosts(5, 4)).toEqual([2, 1, 1, 1]);
  });

  it("always adds up to the total", () => {
    for (const [total, count] of [
      [1999, 7],
      [1, 3],
      [0, 5],
      [123_456, 13],
    ] as const) {
      const costs = lotUnitCosts(total, count);
      expect(costs).toHaveLength(count);
      expect(costs.reduce((sum, cost) => sum + cost, 0)).toBe(total);
    }
  });
});

describe("moveInList", () => {
  it("moves an id up or down", () => {
    expect(moveInList(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
    expect(moveInList(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("leaves the order alone at either end or for an unknown id", () => {
    expect(moveInList(["a", "b", "c"], "a", -1)).toEqual(["a", "b", "c"]);
    expect(moveInList(["a", "b", "c"], "c", 1)).toEqual(["a", "b", "c"]);
    expect(moveInList(["a", "b", "c"], "x", 1)).toEqual(["a", "b", "c"]);
  });
});

describe("daysHeld", () => {
  it("counts from the last purchase, as on the board", () => {
    expect(daysHeld({ quantityOnHand: 2, lastPurchasedAt: "2026-11-14", today: "2026-11-23" })).toBe(9);
    expect(daysHeld({ quantityOnHand: 1, lastPurchasedAt: "2026-08-02", today: "2026-11-23" })).toBe(113);
  });

  it("is null when sold out or never purchased, and never negative", () => {
    expect(daysHeld({ quantityOnHand: 0, lastPurchasedAt: "2026-10-03", today: "2026-11-23" })).toBeNull();
    expect(daysHeld({ quantityOnHand: 1, lastPurchasedAt: null, today: "2026-11-23" })).toBeNull();
    expect(daysHeld({ quantityOnHand: 1, lastPurchasedAt: "2026-11-25", today: "2026-11-23" })).toBe(0);
  });
});

describe("filterInventoryRows", () => {
  const rows = [
    { id: "1", title: "Dune, hardcover", categoryId: "book", status: "listed" as const, identifiers: ["9780441013593"] },
    { id: "2", title: "The Matrix", categoryId: "dvd", status: "in_stock" as const, identifiers: ["085391737322"] },
    { id: "3", title: "Sapiens, paperback", categoryId: "book", status: "sold_out" as const, identifiers: [] },
    { id: "4", title: "Wool blanket", categoryId: "clothing", status: "in_stock" as const, identifiers: ["BIN-7"] },
  ];
  const ids = (filter: Parameters<typeof filterInventoryRows>[1]) => filterInventoryRows(rows, filter).map((row) => row.id);

  it("returns everything with no filter", () => {
    expect(ids({ query: "", categoryIds: null, status: "all" })).toEqual(["1", "2", "3", "4"]);
  });

  it("searches titles without case", () => {
    expect(ids({ query: "  MATRIX ", categoryIds: null, status: "all" })).toEqual(["2"]);
    expect(ids({ query: "paper", categoryIds: null, status: "all" })).toEqual(["3"]);
  });

  it("searches identifiers, ignoring hyphens and spaces in what was typed", () => {
    expect(ids({ query: "978-0-441-01359-3", categoryIds: null, status: "all" })).toEqual(["1"]);
    expect(ids({ query: "0 85391 73732 2", categoryIds: null, status: "all" })).toEqual(["2"]);
    expect(ids({ query: "bin7", categoryIds: null, status: "all" })).toEqual(["4"]);
    expect(ids({ query: "bin-7", categoryIds: null, status: "all" })).toEqual(["4"]);
    expect(ids({ query: "73732", categoryIds: null, status: "all" })).toEqual(["2"]);
  });

  it("filters by status and by a set of categories", () => {
    expect(ids({ query: "", categoryIds: null, status: "in_stock" })).toEqual(["2", "4"]);
    expect(ids({ query: "", categoryIds: new Set(["book"]), status: "all" })).toEqual(["1", "3"]);
    expect(ids({ query: "dune", categoryIds: new Set(["book"]), status: "sold_out" })).toEqual([]);
  });
});

describe("inventoryTotals", () => {
  it("counts items, units on hand and their cost", () => {
    expect(
      inventoryTotals([
        { quantity: 2, avgUnitCostCents: 1400 },
        { quantity: 0, avgUnitCostCents: 150 },
        { quantity: 4, avgUnitCostCents: 75 },
      ]),
    ).toEqual({ items: 3, units: 6, costCents: 3100 });
  });
});

describe("Cloudinary signing", () => {
  it("matches the example in Cloudinary's documentation", () => {
    expect(
      signCloudinaryParams(
        { timestamp: 1315060510, public_id: "sample_image", eager: "w_400,h_300,c_pad|w_260,h_200,c_crop" },
        "abcd",
      ),
    ).toBe("bfd09f95f331f558cbd1320e67aa8d488770583e");
  });

  it("signs the public id and timestamp the server chose", () => {
    const signed = buildUploadSignature(
      { cloudName: "demo", apiKey: "123", apiSecret: "s3cret-value" },
      "user-1",
      new Date("2026-11-23T00:00:00Z"),
      "asset-1",
    );
    expect(signed).toMatchObject({ cloudName: "demo", apiKey: "123", publicId: "second-story/user-1/asset-1", timestamp: 1795392000 });
    expect(signed.signature).toBe(
      signCloudinaryParams({ public_id: "second-story/user-1/asset-1", timestamp: 1795392000 }, "s3cret-value"),
    );
    expect(JSON.stringify(signed)).not.toContain("s3cret-value");
  });

  it("gives every upload its own public id, inside the user's folder", () => {
    const credentials = { cloudName: "demo", apiKey: "123", apiSecret: "s3cret-value" };
    const first = buildUploadSignature(credentials, "user-1");
    const second = buildUploadSignature(credentials, "user-1");
    expect(first.publicId).not.toBe(second.publicId);
    expect(isOwnPublicId(first.publicId, "user-1")).toBe(true);
    expect(isOwnPublicId(first.publicId, "user-2")).toBe(false);
  });

  it("only accepts public ids in the user's own folder", () => {
    expect(photoFolder("user-1")).toBe("second-story/user-1");
    expect(isOwnPublicId("second-story/user-1/abc123_X-y", "user-1")).toBe(true);
    expect(isOwnPublicId("second-story/user-2/abc123", "user-1")).toBe(false);
    expect(isOwnPublicId("second-story/user-1/", "user-1")).toBe(false);
    expect(isOwnPublicId("second-story/user-1/../user-2/abc", "user-1")).toBe(false);
    expect(isOwnPublicId("abc123", "user-1")).toBe(false);
  });
});

describe("form schemas", () => {
  const base = {
    title: " Dune ",
    categoryId: "7f3c2a1e-4b5d-4c6e-8f90-123456789abc",
    quantity: "2",
    unitCost: "$3.50",
    purchasedAt: "2026-11-20",
  };

  it("parses an add item form, with lists posted as JSON", () => {
    const parsed = createItemFormSchema.parse({
      ...base,
      condition: "",
      source: " Goodwill ",
      identifiers: JSON.stringify([{ type: "isbn13", value: "978-0-441-01359-3" }]),
      photos: "",
    });
    expect(parsed).toMatchObject({
      title: "Dune",
      quantity: 2,
      unitCost: 350,
      condition: null,
      source: "Goodwill",
      identifiers: [{ type: "isbn13", value: "9780441013593" }],
      photos: [],
    });
  });

  it("reports a missing category and a bad amount by field", () => {
    const result = createItemFormSchema.safeParse({ ...base, categoryId: "", unitCost: "abc" });
    expect(result.success).toBe(false);
    const paths = result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
    expect(paths).toContain("categoryId");
    expect(paths).toContain("unitCost");
  });

  it("refuses a purchase whose total does not fit in the database", () => {
    const result = addStockFormSchema.safeParse({
      itemId: base.categoryId,
      quantity: "1000000",
      unitCost: "5000.00",
      purchasedAt: "2026-11-20",
    });
    expect(result.success).toBe(false);
  });

  it("needs at least two lines in a lot", () => {
    const one = createLotFormSchema.safeParse({
      totalCost: "10",
      purchasedAt: "2026-11-20",
      lines: JSON.stringify([{ title: "A", categoryId: base.categoryId }]),
    });
    expect(one.success).toBe(false);
    const two = createLotFormSchema.safeParse({
      totalCost: "10",
      purchasedAt: "2026-11-20",
      lines: JSON.stringify([
        { title: "A", categoryId: base.categoryId },
        { title: "B", categoryId: base.categoryId },
      ]),
    });
    expect(two.success).toBe(true);
  });
});
