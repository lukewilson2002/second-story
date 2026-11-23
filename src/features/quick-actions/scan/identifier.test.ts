import { describe, expect, it } from "vitest";
import { addItemHref, readIdentifier } from "./identifier";

describe("readIdentifier", () => {
  it("reads a UPC", () => {
    expect(readIdentifier("085391737322")).toEqual({ identifier: "085391737322", identifierType: "upc" });
  });

  it("reads a book barcode as an ISBN-13", () => {
    expect(readIdentifier("9780441013593")).toEqual({ identifier: "9780441013593", identifierType: "isbn13" });
    expect(readIdentifier(" 978-0-441-01359-3 ")).toEqual({ identifier: "9780441013593", identifierType: "isbn13" });
  });

  it("reads other 13-digit codes as an EAN", () => {
    expect(readIdentifier("4006381333931")).toEqual({ identifier: "4006381333931", identifierType: "ean" });
  });

  it("turns a zero-padded UPC back into 12 digits", () => {
    expect(readIdentifier("0085391737322")).toEqual({ identifier: "085391737322", identifierType: "upc" });
  });

  it("reads a typed ISBN-10 with a check letter", () => {
    expect(readIdentifier("0-8044-2957-x")).toEqual({ identifier: "080442957X", identifierType: "isbn10" });
  });

  it("keeps anything else as typed", () => {
    expect(readIdentifier("12345678")).toEqual({ identifier: "12345678", identifierType: "other" });
    expect(readIdentifier("  SHELF-A1 7  ")).toEqual({ identifier: "SHELF-A1 7", identifierType: "other" });
    expect(readIdentifier("b0abcd1234")).toEqual({ identifier: "B0ABCD1234", identifierType: "asin" });
  });

  it("rejects an empty value", () => {
    expect(readIdentifier("   ")).toBeNull();
  });
});

describe("addItemHref", () => {
  it("links to the Add item form with both fields", () => {
    expect(addItemHref({ identifier: "9780441013593", identifierType: "isbn13" })).toBe(
      "/inventory/new?identifier=9780441013593&identifierType=isbn13",
    );
    expect(addItemHref({ identifier: "A B&C", identifierType: "other" })).toBe(
      "/inventory/new?identifier=A+B%26C&identifierType=other",
    );
  });
});
