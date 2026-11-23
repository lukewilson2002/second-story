import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { DomainError, recordSale, STALE_LISTING_DAYS } from "@/lib/domain";
import { addDays, todayIsoDate } from "@/lib/format";
import {
  createMarketplace,
  deleteDraftListing,
  endListing,
  endListingMarketplace,
  highestMinimumPriceCents,
  loadListingDetail,
  loadListingFormOptions,
  loadListingRows,
  saveListing,
} from "./data";
import { addFeeRule, addItem, categoryIdByName, listingInput, marketplaceIdByName } from "./testing";

let t: TestDb;
let ebay: string;
let mercari: string;
let vinted: string;
let zelda: string;
let pak: string;

beforeAll(async () => {
  t = await createTestDb();
  ebay = await marketplaceIdByName(t.db, t.userId, "eBay");
  mercari = await marketplaceIdByName(t.db, t.userId, "Mercari");
  vinted = await marketplaceIdByName(t.db, t.userId, "Vinted");
  const book = await categoryIdByName(t.db, t.userId, "Book");
  // The New listing board's numbers: $14.00 + $4.00 cost, eBay 13% + $0.40, Mercari 10% + $0.50.
  zelda = await addItem(t.db, t.userId, { title: "Ocarina of Time", categoryId: book, quantity: 5, unitCostCents: 1400 });
  pak = await addItem(t.db, t.userId, { title: "Expansion Pak", categoryId: book, quantity: 5, unitCostCents: 400 });
  await addFeeRule(t.db, t.userId, { marketplaceId: ebay, percentBps: 1300, fixedCents: 40 });
  await addFeeRule(t.db, t.userId, { marketplaceId: mercari, percentBps: 1000, fixedCents: 50 });
});

afterAll(async () => {
  await t.close();
});

const boardListing = (overrides: Partial<Parameters<typeof listingInput>[0]> = {}) =>
  listingInput({
    title: "Zelda bundle",
    askingPrice: "44.99",
    shippingCharged: "5.00",
    estShippingCost: "5.60",
    commissionPercent: "20",
    commissionPayee: "Sam",
    items: [{ itemId: zelda }, { itemId: pak }],
    marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari }],
    ...overrides,
  });

async function marketplaceRows(listingId: string) {
  const rows = await t.db
    .selectFrom("listing_marketplace")
    .select(["marketplace_id", "status", "listed_at", "ended_at", "external_url", "asking_price_cents"])
    .where("listing_id", "=", listingId)
    .execute();
  return new Map(rows.map((row) => [row.marketplace_id, row]));
}

async function rowFor(listingId: string) {
  const row = (await loadListingRows(t.db, t.userId)).find((item) => item.id === listingId);
  if (!row) throw new Error("listing row missing");
  return row;
}

async function expectDomainError(promise: Promise<unknown>, code: string) {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  expect((error as DomainError).code).toBe(code);
}

describe("highestMinimumPriceCents", () => {
  it("takes the highest, and gives null for no rows or a row with no minimum", () => {
    expect(highestMinimumPriceCents([2259, 2178])).toBe(2259);
    expect(highestMinimumPriceCents([])).toBeNull();
    expect(highestMinimumPriceCents([2259, null])).toBeNull();
  });
});

describe("loadListingFormOptions", () => {
  it("offers the starter marketplaces in the order of the list, then newer ones", async () => {
    const fresh = await createTestDb();
    try {
      await createMarketplace(fresh.db, fresh.userId, "Depop");
      const options = await loadListingFormOptions(fresh.db, fresh.userId);
      expect(options.marketplaces.map((marketplace) => marketplace.name)).toEqual([
        "eBay",
        "Mercari",
        "Facebook Marketplace",
        "Vinted",
        "Depop",
      ]);
    } finally {
      await fresh.close();
    }
  });
});

describe("saveListing", () => {
  it("saves a draft without publishing it", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing({ intent: "draft" }));
    expect(saved.status).toBe("draft");
    const listing = await t.db.selectFrom("listing").selectAll().where("id", "=", saved.id).executeTakeFirstOrThrow();
    expect(listing).toMatchObject({
      status: "draft",
      listed_at: null,
      asking_price_cents: 4499,
      shipping_charged_cents: 500,
      est_shipping_cost_cents: 560,
      commission_bps: 2000,
      commission_payee: "Sam",
    });
    const rows = await marketplaceRows(saved.id);
    expect(rows.get(ebay)?.listed_at).toBeNull();
    const row = await rowFor(saved.id);
    expect(row.daysListed).toBeNull();
    expect(row.status).toBe("draft");
  });

  it("publishes, and the table row shows the board's minimum price", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing());
    expect(saved.status).toBe("active");
    const rows = await marketplaceRows(saved.id);
    expect(rows.get(ebay)).toMatchObject({ status: "active" });
    expect(rows.get(ebay)?.listed_at).toBeInstanceOf(Date);

    const row = await rowFor(saved.id);
    // eBay's minimum is $22.59 and Mercari's is $21.78. The table shows the higher one.
    expect(row.minimumPriceCents).toBe(2259);
    expect(row.belowMinimum).toBe(false);
    expect(row.daysListed).toBe(0);
    expect(row.marketplaces.map((marketplace) => marketplace.name)).toEqual(["eBay", "Mercari"]);

    const detail = await loadListingDetail(t.db, t.userId, saved.id);
    expect(detail?.unitCostCents).toBe(1800);
    const onEbay = detail?.marketplaces.find((marketplace) => marketplace.marketplaceId === ebay);
    expect(onEbay).toMatchObject({ minimumPriceCents: 2259, projectedFeeCents: 690, projectedProfitCents: 1559 });
    const onMercari = detail?.marketplaces.find((marketplace) => marketplace.marketplaceId === mercari);
    expect(onMercari?.minimumPriceCents).toBe(2178);
    expect(detail?.values.items).toEqual([
      { itemId: zelda, quantityPerUnit: 1 },
      { itemId: pak, quantityPerUnit: 1 },
    ]);
  });

  it("keeps item order, because the first item picks the fee category", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing({ items: [{ itemId: pak, quantityPerUnit: 2 }, { itemId: zelda }] }));
    const detail = await loadListingDetail(t.db, t.userId, saved.id);
    expect(detail?.values.items).toEqual([
      { itemId: pak, quantityPerUnit: 2 },
      { itemId: zelda, quantityPerUnit: 1 },
    ]);
    expect(detail?.unitCostCents).toBe(400 * 2 + 1400);

    await saveListing(t.db, t.userId, boardListing({ items: [{ itemId: zelda, quantityPerUnit: 3 }] }), saved.id);
    const edited = await loadListingDetail(t.db, t.userId, saved.id);
    expect(edited?.values.items).toEqual([{ itemId: zelda, quantityPerUnit: 3 }]);
  });

  it("flags a price below the minimum, using a marketplace's own price", async () => {
    const saved = await saveListing(
      t.db,
      t.userId,
      boardListing({ marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari, price: "20.00" }] }),
    );
    const row = await rowFor(saved.id);
    expect(row.belowMinimum).toBe(true);
    const detail = await loadListingDetail(t.db, t.userId, saved.id);
    expect(detail?.marketplaces.find((marketplace) => marketplace.marketplaceId === mercari)).toMatchObject({
      askingPriceCents: 2000,
      belowMinimum: true,
    });
    expect(detail?.values.marketplaces.find((marketplace) => marketplace.marketplaceId === mercari)?.price).toBe("20.00");
  });

  it("edits in place: links can be added later, and listed_at survives", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing());
    const listedAt = new Date("2026-01-05T12:00:00Z");
    await t.db.updateTable("listing_marketplace").set({ listed_at: listedAt }).where("listing_id", "=", saved.id).execute();
    await t.db.updateTable("listing").set({ listed_at: listedAt }).where("id", "=", saved.id).execute();

    await saveListing(
      t.db,
      t.userId,
      boardListing({
        title: "Zelda bundle, tested",
        marketplaces: [{ marketplaceId: ebay, url: "https://www.ebay.com/itm/1" }, { marketplaceId: vinted }],
      }),
      saved.id,
    );

    const after = await marketplaceRows(saved.id);
    expect(after.size).toBe(3);
    expect(after.get(ebay)).toMatchObject({ status: "active", external_url: "https://www.ebay.com/itm/1" });
    expect(after.get(ebay)?.listed_at?.toISOString()).toBe(listedAt.toISOString());
    // Unpicked on a live listing: the row is kept and marked ended.
    expect(after.get(mercari)?.status).toBe("ended");
    expect(after.get(mercari)?.ended_at).toBeInstanceOf(Date);
    // Newly picked: goes up now.
    expect(after.get(vinted)?.status).toBe("active");
    expect(after.get(vinted)?.listed_at?.getTime()).toBeGreaterThan(listedAt.getTime());

    const listing = await t.db.selectFrom("listing").select(["title", "listed_at", "status"]).where("id", "=", saved.id).executeTakeFirstOrThrow();
    expect(listing.title).toBe("Zelda bundle, tested");
    expect(listing.listed_at?.toISOString()).toBe(listedAt.toISOString());

    // The form only shows the marketplaces it is still up on.
    const detail = await loadListingDetail(t.db, t.userId, saved.id);
    expect(detail?.values.marketplaces.map((row) => row.marketplaceId).sort()).toEqual([ebay, vinted].sort());

    // Picking the ended one again puts it back up on the same row.
    await saveListing(t.db, t.userId, boardListing({ marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari }] }), saved.id);
    const again = await marketplaceRows(saved.id);
    expect(again.size).toBe(3);
    expect(again.get(mercari)).toMatchObject({ status: "active", ended_at: null });
    expect(again.get(vinted)?.status).toBe("ended");
  });

  it("deletes unpicked marketplace rows on a draft, then publishes the draft", async () => {
    const draft = await saveListing(t.db, t.userId, boardListing({ intent: "draft" }));
    await saveListing(t.db, t.userId, boardListing({ intent: "draft", marketplaces: [{ marketplaceId: mercari }] }), draft.id);
    expect([...(await marketplaceRows(draft.id)).keys()]).toEqual([mercari]);

    const published = await saveListing(t.db, t.userId, boardListing({ marketplaces: [{ marketplaceId: mercari }] }), draft.id);
    expect(published).toEqual({ id: draft.id, status: "active" });
    const rows = await marketplaceRows(draft.id);
    expect(rows.get(mercari)?.listed_at).toBeInstanceOf(Date);
    expect((await rowFor(draft.id)).daysListed).toBe(0);
  });

  it("will not turn a published listing back into a draft", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing());
    await expectDomainError(saveListing(t.db, t.userId, boardListing({ intent: "draft" }), saved.id), "invalid");
  });

  it("rejects a quantity below the units already sold, and any edit of a sold listing", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing({ quantity: 3, items: [{ itemId: zelda }] }));
    await recordSale(t.db, t.userId, { listingId: saved.id, marketplaceId: ebay, soldAt: todayIsoDate(), quantity: 2, salePriceCents: 8000 });
    await expectDomainError(saveListing(t.db, t.userId, boardListing({ quantity: 1, items: [{ itemId: zelda }] }), saved.id), "invalid");
    await saveListing(t.db, t.userId, boardListing({ quantity: 4, items: [{ itemId: zelda }] }), saved.id);
    const row = await rowFor(saved.id);
    expect(row).toMatchObject({ quantity: 4, soldQuantity: 2, status: "active" });

    await recordSale(t.db, t.userId, { listingId: saved.id, marketplaceId: ebay, soldAt: todayIsoDate(), quantity: 2, salePriceCents: 8000 });
    await expectDomainError(saveListing(t.db, t.userId, boardListing({ quantity: 4, items: [{ itemId: zelda }] }), saved.id), "invalid");
  });

  it("rejects an item or marketplace that does not exist, and a missing listing", async () => {
    const missing = "99999999-9999-4999-8999-999999999999";
    await expectDomainError(saveListing(t.db, t.userId, boardListing({ items: [{ itemId: missing }] })), "invalid");
    await expectDomainError(saveListing(t.db, t.userId, boardListing({ marketplaces: [{ marketplaceId: missing }] })), "invalid");
    await expectDomainError(saveListing(t.db, t.userId, boardListing(), missing), "not_found");
  });
});

describe("ending a listing", () => {
  it("takes one marketplace down while the other stays up, then ends the listing with the last one", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing());
    expect(await endListingMarketplace(t.db, t.userId, saved.id, mercari)).toEqual({ listingEnded: false });
    let rows = await marketplaceRows(saved.id);
    expect(rows.get(mercari)?.status).toBe("ended");
    expect(rows.get(ebay)?.status).toBe("active");
    expect((await rowFor(saved.id)).status).toBe("active");
    // Mercari is down, so only eBay's minimum counts now.
    expect((await rowFor(saved.id)).minimumPriceCents).toBe(2259);

    await expectDomainError(endListingMarketplace(t.db, t.userId, saved.id, mercari), "not_on_marketplace");

    expect(await endListingMarketplace(t.db, t.userId, saved.id, ebay)).toEqual({ listingEnded: true });
    rows = await marketplaceRows(saved.id);
    expect(rows.get(ebay)?.status).toBe("ended");
    const row = await rowFor(saved.id);
    expect(row.status).toBe("ended");
    expect(row.daysListed).toBe(0);
  });

  it("ends everywhere, and an ended listing can be relisted", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing());
    await endListing(t.db, t.userId, saved.id);
    const rows = await marketplaceRows(saved.id);
    expect([...rows.values()].map((row) => row.status)).toEqual(["ended", "ended"]);
    expect((await rowFor(saved.id)).status).toBe("ended");
    await expectDomainError(endListing(t.db, t.userId, saved.id), "invalid");

    // An ended listing opens in the form with no marketplace picked.
    const detail = await loadListingDetail(t.db, t.userId, saved.id);
    expect(detail?.values.marketplaces).toEqual([]);

    await t.db.updateTable("listing").set({ listed_at: new Date("2026-01-05T12:00:00Z") }).where("id", "=", saved.id).execute();
    const relisted = await saveListing(t.db, t.userId, boardListing({ marketplaces: [{ marketplaceId: ebay }] }), saved.id);
    expect(relisted.status).toBe("active");
    const listing = await t.db.selectFrom("listing").select(["status", "ended_at"]).where("id", "=", saved.id).executeTakeFirstOrThrow();
    expect(listing).toEqual({ status: "active", ended_at: null });
    const after = await marketplaceRows(saved.id);
    expect(after.get(ebay)).toMatchObject({ status: "active", ended_at: null });
    expect(after.get(mercari)?.status).toBe("ended");
    // Days listed start again on a relist.
    expect((await rowFor(saved.id)).daysListed).toBe(0);
  });

  it("clears a sold listing that is still up elsewhere", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing({ items: [{ itemId: pak }] }));
    const sale = await recordSale(t.db, t.userId, { listingId: saved.id, marketplaceId: ebay, soldAt: todayIsoDate(), salePriceCents: 4499 });
    expect(sale.stillActiveOnMarketplaceIds).toEqual([mercari]);
    let row = await rowFor(saved.id);
    expect(row).toMatchObject({ status: "sold", stillUpCount: 1 });

    expect(await endListingMarketplace(t.db, t.userId, saved.id, mercari)).toEqual({ listingEnded: false });
    row = await rowFor(saved.id);
    expect(row).toMatchObject({ status: "sold", stillUpCount: 0 });
  });

  it("marks a sold listing as taken down everywhere without changing its status", async () => {
    const saved = await saveListing(
      t.db,
      t.userId,
      boardListing({ items: [{ itemId: pak }], marketplaces: [{ marketplaceId: ebay }, { marketplaceId: mercari }, { marketplaceId: vinted }] }),
    );
    await recordSale(t.db, t.userId, { listingId: saved.id, marketplaceId: ebay, soldAt: todayIsoDate(), salePriceCents: 4499 });
    expect((await rowFor(saved.id)).stillUpCount).toBe(2);
    await endListing(t.db, t.userId, saved.id);
    expect(await rowFor(saved.id)).toMatchObject({ status: "sold", stillUpCount: 0 });
  });

  it("deletes a draft but not a published listing", async () => {
    const draft = await saveListing(t.db, t.userId, boardListing({ intent: "draft" }));
    await deleteDraftListing(t.db, t.userId, draft.id);
    expect(await loadListingDetail(t.db, t.userId, draft.id)).toBeNull();
    expect((await marketplaceRows(draft.id)).size).toBe(0);

    const live = await saveListing(t.db, t.userId, boardListing());
    await expectDomainError(deleteDraftListing(t.db, t.userId, live.id), "invalid");
    await expectDomainError(endListing(t.db, t.userId, (await saveListing(t.db, t.userId, boardListing({ intent: "draft" }))).id), "invalid");
  });
});

describe("loadListingRows", () => {
  it("marks an active listing as stale after more than 60 days", async () => {
    const saved = await saveListing(t.db, t.userId, boardListing({ title: "Dusty" }));
    const today = todayIsoDate();
    const old = new Date(`${addDays(today, -(STALE_LISTING_DAYS + 1))}T12:00:00Z`);
    await t.db.updateTable("listing").set({ listed_at: old }).where("id", "=", saved.id).execute();
    const row = await rowFor(saved.id);
    expect(row.daysListed).toBe(STALE_LISTING_DAYS + 1);
    expect(row.stale).toBe(true);

    const edge = new Date(`${addDays(today, -STALE_LISTING_DAYS)}T12:00:00Z`);
    await t.db.updateTable("listing").set({ listed_at: edge }).where("id", "=", saved.id).execute();
    expect((await rowFor(saved.id)).stale).toBe(false);

    await t.db.updateTable("listing").set({ listed_at: old }).where("id", "=", saved.id).execute();
    await endListing(t.db, t.userId, saved.id);
    expect((await rowFor(saved.id)).stale).toBe(false);
  });

  it("shows no minimum for a listing on no marketplace", async () => {
    const draft = await saveListing(t.db, t.userId, boardListing({ intent: "draft", marketplaces: [] }));
    expect(await rowFor(draft.id)).toMatchObject({ minimumPriceCents: null, belowMinimum: false, marketplaces: [] });
  });
});

describe("loadListingFormOptions", () => {
  it("offers items in stock, live marketplaces and the default commission", async () => {
    const book = await categoryIdByName(t.db, t.userId, "Book");
    const gone = await addItem(t.db, t.userId, { title: "Sold out thing", categoryId: book, quantity: 1, unitCostCents: 100 });
    await t.db.updateTable("inventory_item").set({ quantity_on_hand: 0 }).where("id", "=", gone).execute();
    await t.db.insertInto("item_identifier").values({ user_id: t.userId, item_id: zelda, type: "upc", value: "045496870027" }).execute();
    await t.db
      .updateTable("user_settings")
      .set({ default_commission_bps: 2000, default_commission_payee: "Sam" })
      .where("user_id", "=", t.userId)
      .execute();

    const options = await loadListingFormOptions(t.db, t.userId);
    expect(options.items.map((item) => item.id)).not.toContain(gone);
    const zeldaOption = options.items.find((item) => item.id === zelda);
    expect(zeldaOption).toMatchObject({ title: "Ocarina of Time", avgUnitCostCents: 1400, categoryName: "Book", categoryPath: "Book" });
    expect(zeldaOption?.searchText).toContain("045496870027");
    expect(options.marketplaces.map((marketplace) => marketplace.name)).toEqual(
      expect.arrayContaining(["eBay", "Mercari", "Facebook Marketplace", "Vinted"]),
    );
    expect(options.feeRules).toHaveLength(2);
    expect(options).toMatchObject({ defaultCommissionBps: 2000, defaultCommissionPayee: "Sam" });

    // A listing's own sold-out item stays on its form.
    const kept = await loadListingFormOptions(t.db, t.userId, { itemIds: [gone] });
    expect(kept.items.map((item) => item.id)).toContain(gone);
  });
});

describe("createMarketplace", () => {
  it("adds a marketplace, reuses a name that exists, and brings back an archived one", async () => {
    const depop = await createMarketplace(t.db, t.userId, "  Depop ");
    expect(depop.name).toBe("Depop");
    expect(await createMarketplace(t.db, t.userId, "depop")).toEqual(depop);

    await t.db.updateTable("marketplace").set({ archived_at: new Date() }).where("id", "=", depop.id).execute();
    expect((await loadListingFormOptions(t.db, t.userId)).marketplaces.map((row) => row.id)).not.toContain(depop.id);
    expect(await createMarketplace(t.db, t.userId, "DEPOP")).toEqual(depop);
    expect((await loadListingFormOptions(t.db, t.userId)).marketplaces.map((row) => row.id)).toContain(depop.id);

    await expectDomainError(createMarketplace(t.db, t.userId, "   "), "invalid");
  });
});
