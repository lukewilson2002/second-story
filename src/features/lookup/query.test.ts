import { describe, expect, it } from "vitest";
import { addToInventoryHref, cleanQuery, lookupHref, normalizeQuery, queryIdentifier } from "./query";

describe("cleanQuery", () => {
  it("trims and collapses whitespace", () => {
    expect(cleanQuery("  Mario \t Kart  ")).toBe("Mario Kart");
  });
  it("rejects empty and over-long queries", () => {
    expect(cleanQuery("   ")).toBeNull();
    expect(cleanQuery(undefined)).toBeNull();
    expect(cleanQuery("a".repeat(201))).toBeNull();
    expect(cleanQuery("a".repeat(200))).toHaveLength(200);
  });
});

describe("normalizeQuery", () => {
  it("ignores case and spacing", () => {
    expect(normalizeQuery("  Mario   KART wii ")).toBe("mario kart wii");
  });
  it("drops dashes and spaces from a barcode", () => {
    expect(normalizeQuery("0-45496-59042-0")).toBe("045496590420");
    expect(normalizeQuery("978 0 306 40615 7")).toBe("9780306406157");
  });
});

describe("queryIdentifier", () => {
  it("recognizes barcodes and leaves titles alone", () => {
    expect(queryIdentifier("045496590420")).toEqual({ type: "upc", value: "045496590420" });
    expect(queryIdentifier("978-0-306-40615-7")).toEqual({ type: "isbn13", value: "9780306406157" });
    expect(queryIdentifier("Mario Kart Wii")).toBeNull();
  });
});

describe("addToInventoryHref", () => {
  it("prefills the title only for a text search", () => {
    expect(addToInventoryHref({ itemTitle: "Mario Kart Wii (Wii)", identifier: null }, "mario kart")).toBe(
      "/inventory/new?title=Mario+Kart+Wii+%28Wii%29",
    );
  });
  it("adds the searched barcode when the source reports no identifier", () => {
    expect(addToInventoryHref({ itemTitle: "Some DVD", identifier: null }, "0-45496-59042-0")).toBe(
      "/inventory/new?title=Some+DVD&identifier=045496590420&identifierType=upc",
    );
  });
  it("prefers the identifier the source reports", () => {
    expect(
      addToInventoryHref({ itemTitle: "Zelda", identifier: { type: "upc", value: "045496590420" } }, "zelda"),
    ).toBe("/inventory/new?title=Zelda&identifier=045496590420&identifierType=upc");
  });
});

describe("lookupHref", () => {
  it("encodes the query", () => {
    expect(lookupHref("Chrono Trigger & more")).toBe("/lookup?q=Chrono+Trigger+%26+more");
  });
});
