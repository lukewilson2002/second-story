import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PriceSourceError } from "../types";
import { parsePriceChartingHtml, priceChartingSearchUrl } from "./pricecharting";

// Real pages fetched from pricecharting.com on 2026-11-23.
// Scripts, styles, site chrome and the sold-listing tables were removed, and the mixed search was cut to its first 10 rows.
function fixture(name: string): string {
  return readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8");
}

describe("parsePriceChartingHtml", () => {
  it("reads product, platform and loose, complete and new prices from a games search", () => {
    const parsed = parsePriceChartingHtml(fixture("pricecharting-search-games.html"), { query: "chrono trigger super nintendo" });
    expect(parsed.results).toHaveLength(5);
    expect(parsed.results[0]).toEqual({
      id: "6889",
      source: "pricecharting",
      title: "Chrono Trigger",
      itemTitle: "Chrono Trigger (Super Nintendo)",
      searchText: "Chrono Trigger Super Nintendo",
      subtitle: "Super Nintendo",
      prices: [
        { key: "loose", label: "Loose", cents: 27085 },
        { key: "complete", label: "Complete", cents: 78300 },
        { key: "new", label: "New", cents: 164227 },
      ],
      url: "https://www.pricecharting.com/game/super-nintendo/chrono-trigger",
      imageUrl: expect.stringMatching(/^https:\/\/storage\.googleapis\.com\/images\.pricecharting\.com\//),
      identifier: null,
    });
    expect(parsed.summary).toEqual([]);
    expect(parsed.notice).toBeNull();
    expect(parsed.searchUrl).toBe(priceChartingSearchUrl("chrono trigger super nintendo"));
  });

  it("gives null for a price the table leaves blank", () => {
    const parsed = parsePriceChartingHtml(fixture("pricecharting-search-games.html"), { query: "chrono trigger" });
    const homebrew = parsed.results.find((result) => result.id === "7800750");
    expect(homebrew?.title).toBe("Chrono Trigger: Flame Of Eternity [Homebrew]");
    expect(homebrew?.prices.map((price) => price.cents)).toEqual([2700, null, 52100]);
  });

  it("keeps PriceCharting's Low, Mid and High headings when a search mixes games with other products", () => {
    const parsed = parsePriceChartingHtml(fixture("pricecharting-search-mixed.html"), { query: "mario kart" });
    expect(parsed.results).toHaveLength(10);
    const first = parsed.results[0];
    expect(first?.title).toBe("Mario Kart Wii");
    expect(first?.subtitle).toBe("Wii");
    expect(first?.prices).toEqual([
      { key: "loose", label: "Low", cents: 2523 },
      { key: "complete", label: "Mid", cents: 3210 },
      { key: "new", label: "High", cents: 5999 },
    ]);
    expect(new Set(parsed.results.map((result) => result.id)).size).toBe(10);
  });

  it("reads a single product page, which is where a barcode search lands", () => {
    const parsed = parsePriceChartingHtml(fixture("pricecharting-product.html"), {
      query: "045496590420",
      finalUrl: "https://www.pricecharting.com/game/nintendo-switch/zelda-breath-of-the-wild?q=045496590420",
    });
    expect(parsed.results).toEqual([
      {
        id: "37294",
        source: "pricecharting",
        title: "Zelda Breath of the Wild",
        itemTitle: "Zelda Breath of the Wild (Nintendo Switch)",
        searchText: "Zelda Breath of the Wild Nintendo Switch",
        subtitle: "Nintendo Switch",
        prices: [
          { key: "loose", label: "Loose", cents: 3263 },
          { key: "complete", label: "Complete", cents: 3423 },
          { key: "new", label: "New", cents: 4146 },
        ],
        url: "https://www.pricecharting.com/game/nintendo-switch/zelda-breath-of-the-wild",
        imageUrl: "https://storage.googleapis.com/images.pricecharting.com/zim6wig6qpxawhou/240.jpg",
        identifier: { type: "upc", value: "045496590420" },
      },
    ]);
    expect(parsed.notice).toMatch(/one product/);
  });

  it("returns no results when PriceCharting swapped in a looser search because nothing matched", () => {
    const html = fixture("pricecharting-no-results.html");
    // The page still lists unrelated products, which is why the notice has to be checked.
    expect(html).toContain('id="games_table"');
    expect(parsePriceChartingHtml(html, { query: "zzqxv nothing here qqq" }).results).toEqual([]);
  });

  it("throws when the page has neither a result table nor a product", () => {
    const parse = () => parsePriceChartingHtml("<html><body><h1>Please verify you are human</h1></body></html>", { query: "x" });
    expect(parse).toThrow(PriceSourceError);
    expect(parse).toThrow(/could not read/);
  });
});
