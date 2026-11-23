import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PriceSourceError } from "../types";
import { mapEbaySearchResponse, readRapidApiQuota, summarizeSoldPrices } from "./ebay";

// A real answer from GET /search?query=Mario%20Kart%20Wii on 2026-11-23, cut from 100 results to the first 30.
const body: unknown = JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", "ebay-search.json"), "utf8"));

describe("mapEbaySearchResponse", () => {
  const mapped = mapEbaySearchResponse(body, { query: "Mario Kart Wii" });

  it("maps every sold listing with prices in integer cents", () => {
    expect(mapped.results).toHaveLength(30);
    expect(mapped.results[0]).toEqual({
      id: "327471467573",
      source: "ebay",
      title: "Nintendo Wii Console Bundle w/ 7 Games ~ Mario Kart ~ Sonic ~ Wolverine",
      itemTitle: "Nintendo Wii Console Bundle w/ 7 Games ~ Mario Kart ~ Sonic ~ Wolverine",
      searchText: null,
      subtitle: "Pre-Owned · Best Offer · Sold Nov 23, 2026",
      prices: [
        { key: "sold", label: "Sold", cents: 12000 },
        { key: "shipping", label: "Shipping", cents: 1796 },
      ],
      url: "https://www.ebay.com/itm/327471467573",
      imageUrl: "https://i.ebayimg.com/images/g/IR8AAeSwlyBrA8jc/s-l225.jpg",
      identifier: null,
    });
    expect(mapped.results[1]?.prices).toEqual([
      { key: "sold", label: "Sold", cents: 3495 },
      { key: "shipping", label: "Shipping", cents: 0 },
    ]);
    for (const result of mapped.results) {
      for (const price of result.prices) {
        expect(price.cents === null || Number.isInteger(price.cents)).toBe(true);
      }
    }
  });

  it("works out median, average, low and high, since /search sends no summary", () => {
    const sold = mapped.results.map((result) => result.prices[0]?.cents ?? 0);
    const sorted = [...sold].sort((a, b) => a - b);
    const total = sold.reduce((sum, cents) => sum + cents, 0);
    expect(mapped.summary).toEqual([
      { key: "median", label: "Median", cents: Math.floor(((sorted[14] ?? 0) + (sorted[15] ?? 0) + 1) / 2) },
      { key: "average", label: "Average", cents: Math.floor((total * 2 + 30) / 60) },
      { key: "low", label: "Low", cents: 469 },
      { key: "high", label: "High", cents: 27500 },
    ]);
  });

  it("links to the same sold search on eBay", () => {
    expect(mapped.searchUrl).toBe("https://www.ebay.com/sch/i.html?_nkw=Mario+Kart+Wii&LH_Sold=1&LH_Complete=1");
  });

  it("returns an empty list and no summary when nothing sold", () => {
    const empty = mapEbaySearchResponse({ site: "EBAY_US", count: 0, results: [] }, { query: "nothing" });
    expect(empty.results).toEqual([]);
    expect(empty.summary).toEqual([]);
  });

  it("skips a listing with no price and accepts the older `link` field", () => {
    const mixed = mapEbaySearchResponse(
      { results: [{ title: "No price" }, { title: "Old shape", sale_price: 19.99, link: "https://www.ebay.com/itm/1" }] },
      { query: "x" },
    );
    expect(mixed.results).toHaveLength(1);
    expect(mixed.results[0]?.url).toBe("https://www.ebay.com/itm/1");
    expect(mixed.results[0]?.prices).toEqual([
      { key: "sold", label: "Sold", cents: 1999 },
      { key: "shipping", label: "Shipping", cents: null },
    ]);
  });

  it("throws when the body is not a search answer", () => {
    expect(() => mapEbaySearchResponse({ message: "You are not subscribed to this API." }, { query: "x" })).toThrow(PriceSourceError);
    expect(() => mapEbaySearchResponse(null, { query: "x" })).toThrow(PriceSourceError);
  });
});

describe("summarizeSoldPrices", () => {
  it("uses the middle price for an odd count and rounds the mean half up", () => {
    expect(summarizeSoldPrices([500, 100, 301])).toEqual([
      { key: "median", label: "Median", cents: 301 },
      { key: "average", label: "Average", cents: 300 },
      { key: "low", label: "Low", cents: 100 },
      { key: "high", label: "High", cents: 500 },
    ]);
    expect(summarizeSoldPrices([100, 101])[0]?.cents).toBe(101);
  });
});

describe("readRapidApiQuota", () => {
  it("reads the allowance headers seen on the live API", () => {
    const headers = new Headers({
      "x-ratelimit-requests-limit": "50",
      "x-ratelimit-requests-remaining": "46",
      "x-ratelimit-requests-reset": "2583244",
    });
    expect(readRapidApiQuota(headers, new Date("2026-11-23T17:37:00.000Z"))).toEqual({
      limit: 50,
      remaining: 46,
      resetsAt: "2026-12-23T15:11:04.000Z",
    });
  });

  it("returns null when the headers are missing", () => {
    expect(readRapidApiQuota(new Headers())).toBeNull();
  });
});
