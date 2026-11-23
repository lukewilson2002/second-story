import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { endListingMarketplace, saveListing } from "@/features/listings/data";
import { addFeeRule, addItem, categoryIdByName, listingInput, marketplaceIdByName } from "@/features/listings/testing";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { DomainError, recordSale } from "@/lib/domain";
import { salesCsv } from "./csv";
import { commissionOwed, loadSaleRows, loadSellableListings, markAllCommissionPaid, setCommissionPaid } from "./data";
import { markSoldFormSchema } from "./schemas";

let t: TestDb;
let ebay: string;
let mercari: string;
let zelda: string;
let pak: string;
let book: string;

beforeAll(async () => {
  t = await createTestDb();
  ebay = await marketplaceIdByName(t.db, t.userId, "eBay");
  mercari = await marketplaceIdByName(t.db, t.userId, "Mercari");
  book = await categoryIdByName(t.db, t.userId, "Book");
  zelda = await addItem(t.db, t.userId, { title: "Ocarina of Time", categoryId: book, quantity: 2, unitCostCents: 1400 });
  pak = await addItem(t.db, t.userId, { title: "Expansion Pak", categoryId: book, quantity: 1, unitCostCents: 400 });
  await addFeeRule(t.db, t.userId, { marketplaceId: ebay, percentBps: 1300, fixedCents: 40 });
  await addFeeRule(t.db, t.userId, { marketplaceId: mercari, percentBps: 1000, fixedCents: 50 });
});

afterAll(async () => {
  await t.close();
});

async function onHand(itemId: string): Promise<number> {
  const row = await t.db.selectFrom("inventory_item").select("quantity_on_hand").where("id", "=", itemId).executeTakeFirstOrThrow();
  return row.quantity_on_hand;
}

/** Posts the mark-sold form the way the browser would, through the real schema and the shared recordSale. */
function markSold(fields: Record<string, string>) {
  return recordSale(t.db, t.userId, markSoldFormSchema.parse({ soldAt: "2026-11-20", ...fields }));
}

describe("mark sold, from form to sale row", () => {
  it("records the board's sale: fee from the rule, snapshots, stock, sold status, still up elsewhere", async () => {
    const listing = await saveListing(
      t.db,
      t.userId,
      listingInput({
        title: "Zelda bundle",
        askingPrice: "44.99",
        shippingCharged: "5.00",
        estShippingCost: "5.60",
        commissionPercent: "20",
        commissionPayee: "Sam",
        items: [{ itemId: zelda }, { itemId: pak }],
        marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari, price: "42.00" }],
      }),
    );

    const sellable = await loadSellableListings(t.db, t.userId);
    expect(sellable).toHaveLength(1);
    expect(sellable[0]).toMatchObject({
      id: listing.id,
      title: "Zelda bundle",
      quantityLeft: 1,
      shippingChargedCents: 500,
      commissionBps: 2000,
      unitCostCents: 1800,
    });
    expect(sellable[0]?.marketplaces).toEqual([
      { marketplaceId: ebay, name: "eBay", askingPriceCents: 4499, rule: expect.objectContaining({ percentBps: 1300, fixedCents: 40 }) },
      { marketplaceId: mercari, name: "Mercari", askingPriceCents: 4200, rule: expect.objectContaining({ percentBps: 1000, fixedCents: 50 }) },
    ]);

    // No fee typed, so the fee rule applies. Shipping charged comes from the listing.
    const sale = await markSold({ listingId: listing.id, marketplaceId: ebay, salePrice: "44.99", shippingCost: "5.60", additionalFees: "" });
    expect(sale.listingSoldOut).toBe(true);
    expect(sale.stillActiveOnMarketplaceIds).toEqual([mercari]);

    const stored = await t.db.selectFrom("sale").selectAll().where("id", "=", sale.saleId).executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      sold_at: "2026-11-20",
      quantity: 1,
      sale_price_cents: 4499,
      shipping_charged_cents: 500,
      shipping_cost_cents: 560,
      marketplace_fee_cents: 690,
      additional_fees_cents: 0,
      cost_of_goods_cents: 1800,
      commission_cents: 390,
      commission_paid_at: null,
    });
    expect(await onHand(zelda)).toBe(1);
    expect(await onHand(pak)).toBe(0);
    const status = await t.db.selectFrom("listing").select("status").where("id", "=", listing.id).executeTakeFirstOrThrow();
    expect(status.status).toBe("sold");
    expect(await loadSellableListings(t.db, t.userId)).toEqual([]);

    const rows = await loadSaleRows(t.db, t.userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      listingTitle: "Zelda bundle",
      marketplaceName: "eBay",
      revenueCents: 4999,
      profitBeforeCommissionCents: 1949,
      profitCents: 1559,
      marginBps: 3119,
      commissionCents: 390,
      commissionPayee: "Sam",
      commissionPaidAt: null,
    });
    expect(salesCsv(rows).split("\r\n")[1]).toBe("2026-11-20,Zelda bundle,eBay,1,44.99,5.00,49.99,6.90,0.00,5.60,18.00,19.49,3.90,Sam,,15.59,31.19");

    // A later change to the fee rule or the item's cost does not rewrite the recorded sale.
    await t.db.updateTable("fee_rule").set({ percent_bps: 5000 }).where("marketplace_id", "=", ebay).execute();
    await t.db.updateTable("purchase").set({ unit_cost_cents: 9900 }).where("item_id", "=", zelda).execute();
    expect((await loadSaleRows(t.db, t.userId))[0]?.profitCents).toBe(1559);
    await t.db.updateTable("fee_rule").set({ percent_bps: 1300 }).where("marketplace_id", "=", ebay).execute();
    await t.db.updateTable("purchase").set({ unit_cost_cents: 1400 }).where("item_id", "=", zelda).execute();

    await expect(markSold({ listingId: listing.id, marketplaceId: mercari, salePrice: "42.00" })).rejects.toMatchObject({
      code: "listing_not_active",
    });
  });

  it("sells part of a multi-unit listing with a typed fee, extra fees and a quantity", async () => {
    const copies = await addItem(t.db, t.userId, { title: "Paperback", categoryId: book, quantity: 5, unitCostCents: 200 });
    const listing = await saveListing(
      t.db,
      t.userId,
      listingInput({
        title: "Paperback copies",
        askingPrice: "10.00",
        quantity: 5,
        shippingCharged: "4.00",
        items: [{ itemId: copies }],
        marketplaces: [{ marketplaceId: ebay }],
      }),
    );
    const sale = await markSold({
      listingId: listing.id,
      marketplaceId: ebay,
      quantity: "2",
      salePrice: "19.00",
      shippingCost: "7.50",
      additionalFees: "1.25",
      marketplaceFee: "3.00",
    });
    expect(sale.listingSoldOut).toBe(false);
    const stored = await t.db.selectFrom("sale").selectAll().where("id", "=", sale.saleId).executeTakeFirstOrThrow();
    expect(stored).toMatchObject({
      quantity: 2,
      sale_price_cents: 1900,
      // The listing's $4.00 per unit, times two.
      shipping_charged_cents: 800,
      shipping_cost_cents: 750,
      marketplace_fee_cents: 300,
      additional_fees_cents: 125,
      cost_of_goods_cents: 400,
      commission_cents: 0,
    });
    expect(await onHand(copies)).toBe(3);
    const sellable = (await loadSellableListings(t.db, t.userId)).find((row) => row.id === listing.id);
    expect(sellable?.quantityLeft).toBe(3);

    const error: unknown = await markSold({ listingId: listing.id, marketplaceId: ebay, quantity: "4", salePrice: "40" }).then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe("not_enough_listing_quantity");
    expect(await onHand(copies)).toBe(3);
  });

  it("does not offer a marketplace the listing was taken down from", async () => {
    const dvd = await addItem(t.db, t.userId, { title: "DVD", categoryId: book, quantity: 1, unitCostCents: 100 });
    const listing = await saveListing(
      t.db,
      t.userId,
      listingInput({ title: "DVD", askingPrice: "8.00", items: [{ itemId: dvd }], marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari }] }),
    );
    await endListingMarketplace(t.db, t.userId, listing.id, mercari);
    const sellable = (await loadSellableListings(t.db, t.userId)).find((row) => row.id === listing.id);
    expect(sellable?.marketplaces.map((row) => row.name)).toEqual(["eBay"]);

    await endListingMarketplace(t.db, t.userId, listing.id, ebay);
    expect((await loadSellableListings(t.db, t.userId)).some((row) => row.id === listing.id)).toBe(false);
  });
});

describe("commission", () => {
  it("is owed until marked paid, one sale at a time or all at once", async () => {
    let rows = await loadSaleRows(t.db, t.userId);
    const withCommission = rows.find((row) => row.commissionCents > 0);
    const without = rows.find((row) => row.commissionCents === 0);
    if (!withCommission || !without) throw new Error("expected one sale with commission and one without");
    expect(commissionOwed(rows)).toEqual({ totalCents: 390, count: 1 });

    await setCommissionPaid(t.db, t.userId, withCommission.id, "2026-11-22");
    rows = await loadSaleRows(t.db, t.userId);
    expect(rows.find((row) => row.id === withCommission.id)?.commissionPaidAt).toBe("2026-11-22");
    expect(commissionOwed(rows)).toEqual({ totalCents: 0, count: 0 });

    await setCommissionPaid(t.db, t.userId, withCommission.id, null);
    expect(commissionOwed(await loadSaleRows(t.db, t.userId)).count).toBe(1);

    await expect(setCommissionPaid(t.db, t.userId, without.id, "2026-11-22")).rejects.toMatchObject({ code: "not_found" });

    expect(await markAllCommissionPaid(t.db, t.userId, "2026-11-23")).toBe(1);
    expect(await markAllCommissionPaid(t.db, t.userId, "2026-11-23")).toBe(0);
    rows = await loadSaleRows(t.db, t.userId);
    expect(rows.find((row) => row.id === withCommission.id)?.commissionPaidAt).toBe("2026-11-23");
    expect(rows.find((row) => row.id === without.id)?.commissionPaidAt).toBeNull();
  });
});
