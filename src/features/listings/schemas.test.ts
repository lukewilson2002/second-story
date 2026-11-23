import { describe, expect, it } from "vitest";
import { listingFormSchema, newMarketplaceSchema, parseListingsQuery } from "./schemas";

const ITEM = "11111111-1111-4111-8111-111111111111";
const ITEM_2 = "22222222-2222-4222-8222-222222222222";
const MARKET = "33333333-3333-4333-8333-333333333333";

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    intent: "publish",
    title: "  Zelda bundle ",
    askingPrice: "$44.99",
    quantity: "1",
    shippingCharged: "5",
    estShippingCost: "5.60",
    commissionPercent: "20%",
    commissionPayee: " Sam ",
    items: JSON.stringify([
      { itemId: ITEM, quantityPerUnit: 1 },
      { itemId: ITEM_2, quantityPerUnit: 2 },
    ]),
    marketplaces: JSON.stringify([{ marketplaceId: MARKET, url: " https://example.com/1 ", price: "49.99" }]),
    ...overrides,
  };
}

function errorPaths(input: Record<string, string>): string[] {
  const result = listingFormSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("listingFormSchema", () => {
  it("turns the posted text into cents, basis points and lists", () => {
    expect(listingFormSchema.parse(form())).toEqual({
      intent: "publish",
      title: "Zelda bundle",
      askingPriceCents: 4499,
      quantity: 1,
      shippingChargedCents: 500,
      estShippingCostCents: 560,
      commissionBps: 2000,
      commissionPayee: "Sam",
      items: [
        { itemId: ITEM, quantityPerUnit: 1 },
        { itemId: ITEM_2, quantityPerUnit: 2 },
      ],
      marketplaces: [{ marketplaceId: MARKET, externalUrl: "https://example.com/1", askingPriceCents: 4999 }],
    });
  });

  it("defaults both shipping fields to 0 and commission to none", () => {
    const parsed = listingFormSchema.parse(
      form({ shippingCharged: "", estShippingCost: "", commissionPercent: "", commissionPayee: "Sam" }),
    );
    expect(parsed.shippingChargedCents).toBe(0);
    expect(parsed.estShippingCostCents).toBe(0);
    expect(parsed.commissionBps).toBeNull();
    expect(parsed.commissionPayee).toBeNull();
  });

  it("treats a 0% commission as no commission", () => {
    const parsed = listingFormSchema.parse(form({ commissionPercent: "0" }));
    expect(parsed.commissionBps).toBeNull();
    expect(parsed.commissionPayee).toBeNull();
  });

  it("leaves the link and the price override empty when nothing is typed", () => {
    const parsed = listingFormSchema.parse(form({ marketplaces: JSON.stringify([{ marketplaceId: MARKET, url: "", price: "" }]) }));
    expect(parsed.marketplaces).toEqual([{ marketplaceId: MARKET, externalUrl: null, askingPriceCents: null }]);
  });

  it("lets a draft be saved with only a title", () => {
    const parsed = listingFormSchema.parse({ intent: "draft", title: "Later", quantity: "1" });
    expect(parsed).toMatchObject({ intent: "draft", askingPriceCents: 0, items: [], marketplaces: [] });
  });

  it("needs an item, a marketplace and a price to publish", () => {
    expect(errorPaths(form({ items: "[]", marketplaces: "[]", askingPrice: "" })).sort()).toEqual([
      "askingPrice",
      "items",
      "marketplaces",
    ]);
  });

  it("needs a title even for a draft", () => {
    expect(errorPaths({ intent: "draft", title: "  ", quantity: "1" })).toEqual(["title"]);
  });

  it("points a bad link or price at the marketplace row it belongs to", () => {
    const marketplaces = JSON.stringify([
      { marketplaceId: MARKET, url: "ebay.com/itm/1", price: "" },
      { marketplaceId: ITEM, url: "", price: "abc" },
    ]);
    expect(errorPaths(form({ marketplaces })).sort()).toEqual(["marketplaces.0.url", "marketplaces.1.price"]);
  });

  it("rejects a javascript: link", () => {
    const marketplaces = JSON.stringify([{ marketplaceId: MARKET, url: "javascript:alert(1)", price: "" }]);
    expect(errorPaths(form({ marketplaces }))).toEqual(["marketplaces.0.url"]);
  });

  it("rejects the same item or marketplace twice", () => {
    const items = JSON.stringify([
      { itemId: ITEM, quantityPerUnit: 1 },
      { itemId: ITEM, quantityPerUnit: 1 },
    ]);
    const marketplaces = JSON.stringify([
      { marketplaceId: MARKET, url: "", price: "" },
      { marketplaceId: MARKET, url: "", price: "" },
    ]);
    expect(errorPaths(form({ items, marketplaces })).sort()).toEqual(["items", "marketplaces"]);
  });

  it("rejects a quantity of 0, a zero item quantity and broken JSON", () => {
    expect(errorPaths(form({ quantity: "0" }))).toEqual(["quantity"]);
    expect(errorPaths(form({ items: JSON.stringify([{ itemId: ITEM, quantityPerUnit: 0 }]) }))).toEqual([
      "items.0.quantityPerUnit",
    ]);
    expect(errorPaths(form({ items: "{not json" }))).toEqual(["items"]);
  });

  it("rejects an unknown intent", () => {
    expect(errorPaths(form({ intent: "sold" }))).toEqual(["intent"]);
  });
});

describe("newMarketplaceSchema", () => {
  it("trims the name and rejects an empty one", () => {
    expect(newMarketplaceSchema.parse({ name: "  Depop " })).toEqual({ name: "Depop" });
    expect(newMarketplaceSchema.safeParse({ name: "   " }).success).toBe(false);
  });
});

describe("parseListingsQuery", () => {
  it("defaults to the active tab", () => {
    expect(parseListingsQuery({})).toEqual({ tab: "active", filter: null });
    expect(parseListingsQuery({ tab: "nope", filter: "nope" })).toEqual({ tab: "active", filter: null });
  });

  it("reads a tab", () => {
    expect(parseListingsQuery({ tab: "draft" })).toEqual({ tab: "draft", filter: null });
  });

  it("lets a dashboard filter pick the tab", () => {
    expect(parseListingsQuery({ filter: "still-up" })).toEqual({ tab: "sold", filter: "still-up" });
    expect(parseListingsQuery({ filter: "stale", tab: "sold" })).toEqual({ tab: "active", filter: "stale" });
    expect(parseListingsQuery({ filter: "below-minimum" })).toEqual({ tab: "active", filter: "below-minimum" });
  });
});
