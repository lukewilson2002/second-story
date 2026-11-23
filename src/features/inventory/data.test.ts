import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, type TestDb } from "@/lib/db/testing";
import { DomainError, loadPurchaseSummaries, purchaseSummaryFor } from "@/lib/domain";
import { photoFolder } from "./cloudinary-sign";
import {
  addIdentifier,
  addPhoto,
  addStock,
  changeCategory,
  correctQuantity,
  createItem,
  createLot,
  deletePhoto,
  findDuplicateItems,
  importItems,
  loadInventoryRows,
  loadItemDetail,
  removeIdentifier,
  reorderPhotos,
  updateItemDetails,
  type NewItemInput,
} from "./data";
import type { ImportRow } from "./schemas";

let t: TestDb;
let bookId: string;
let dvdId: string;
let movieId: string;

const TODAY = "2026-11-23";

beforeAll(async () => {
  t = await createTestDb();
  const categories = await t.db.selectFrom("category").select(["id", "name"]).where("user_id", "=", t.userId).execute();
  const idOf = (name: string) => {
    const found = categories.find((category) => category.name === name);
    if (!found) throw new Error(`Missing starter category ${name}`);
    return found.id;
  };
  bookId = idOf("Book");
  dvdId = idOf("DVD");
  movieId = idOf("Movie");
});

afterAll(async () => {
  await t.close();
});

function newItem(overrides: Partial<NewItemInput> = {}): NewItemInput {
  return {
    title: "Dune, hardcover",
    categoryId: bookId,
    condition: "Good",
    storageLocation: "Shelf A1",
    notes: null,
    identifiers: [],
    photos: [],
    purchase: { quantity: 2, unitCostCents: 200, purchasedAt: "2026-11-18", source: "Goodwill" },
    ...overrides,
  };
}

const photo = (name: string, userId = t.userId) => ({ publicId: `${photoFolder(userId)}/${name}`, width: 800, height: 600 });

describe("createItem", () => {
  it("creates the item, its first purchase, identifiers and photos", async () => {
    const id = await createItem(
      t.db,
      t.userId,
      newItem({
        title: "Create test",
        identifiers: [
          { type: "isbn13", value: "978-1-111-11111-1" },
          { type: "isbn13", value: "9781111111111" },
          { type: "sku", value: " CT-1 " },
        ],
        photos: [photo("first"), photo("second")],
      }),
    );
    const detail = await loadItemDetail(t.db, t.userId, id, TODAY);
    expect(detail).not.toBeNull();
    expect(detail).toMatchObject({
      title: "Create test",
      categoryPath: "Book",
      quantityOnHand: 2,
      status: "in_stock",
      daysHeld: 5,
      condition: "Good",
      storageLocation: "Shelf A1",
    });
    expect(detail?.purchases).toEqual([
      expect.objectContaining({ purchasedAt: "2026-11-18", quantity: 2, unitCostCents: 200, source: "Goodwill" }),
    ]);
    expect(detail?.identifiers.map(({ type, value }) => ({ type, value }))).toEqual([
      { type: "isbn13", value: "9781111111111" },
      { type: "sku", value: "CT-1" },
    ]);
    expect(detail?.photos.map((row) => row.publicId)).toEqual([photo("first").publicId, photo("second").publicId]);
    expect(detail?.summary).toMatchObject({ avgUnitCostCents: 200, totalQuantity: 2, lastPurchasedAt: "2026-11-18" });
  });

  it("refuses a category that is not the user's and a photo outside the user's folder", async () => {
    await expect(
      createItem(t.db, t.userId, newItem({ categoryId: "00000000-0000-4000-8000-000000000000" })),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(
      createItem(t.db, t.userId, newItem({ title: "Bad photo", photos: [photo("x", "someone-else")] })),
    ).rejects.toBeInstanceOf(DomainError);
    const leftover = await t.db.selectFrom("inventory_item").select("id").where("title", "=", "Bad photo").execute();
    expect(leftover).toEqual([]);
  });
});

describe("addStock and correctQuantity", () => {
  it("records another purchase, raises the quantity and reweights the average cost", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Restock test" }));
    await addStock(t.db, t.userId, id, { quantity: 3, unitCostCents: 400, purchasedAt: "2026-11-20", source: null });
    const detail = await loadItemDetail(t.db, t.userId, id, TODAY);
    expect(detail?.quantityOnHand).toBe(5);
    expect(detail?.purchases).toHaveLength(2);
    // (2 × $2.00 + 3 × $4.00) ÷ 5 = $3.20
    expect(detail?.summary).toMatchObject({
      avgUnitCostCents: 320,
      totalQuantity: 5,
      firstPurchasedAt: "2026-11-18",
      lastPurchasedAt: "2026-11-20",
    });
    expect(detail?.daysHeld).toBe(3);
  });

  it("counts two purchases saved at the same moment", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Concurrent restock" }));
    const purchase = { quantity: 1, unitCostCents: 100, purchasedAt: "2026-11-21", source: null };
    await Promise.all([addStock(t.db, t.userId, id, purchase), addStock(t.db, t.userId, id, purchase)]);
    expect((await loadItemDetail(t.db, t.userId, id, TODAY))?.quantityOnHand).toBe(4);
  });

  it("refuses an item that does not exist and writes no purchase", async () => {
    const missing = "00000000-0000-4000-8000-000000000001";
    await expect(
      addStock(t.db, t.userId, missing, { quantity: 1, unitCostCents: 100, purchasedAt: "2026-11-21", source: null }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("corrects the quantity by hand without touching purchases", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Correction test" }));
    await correctQuantity(t.db, t.userId, id, 0);
    const detail = await loadItemDetail(t.db, t.userId, id, TODAY);
    expect(detail).toMatchObject({ quantityOnHand: 0, status: "sold_out", daysHeld: null });
    expect(detail?.purchases).toHaveLength(1);
    expect(detail?.summary.avgUnitCostCents).toBe(200);
  });
});

describe("createLot", () => {
  it("creates one item per line and puts the remainder cents on the first", async () => {
    const ids = await createLot(t.db, t.userId, {
      totalCostCents: 1000,
      purchasedAt: "2026-11-15",
      source: "Estate sale",
      storageLocation: "Bin 3",
      lines: [
        { title: "Lot item A", categoryId: dvdId },
        { title: "Lot item B", categoryId: dvdId },
        { title: "Lot item C", categoryId: bookId },
      ],
    });
    expect(ids).toHaveLength(3);
    const summaries = await loadPurchaseSummaries(t.db, t.userId, ids);
    const costs = ids.map((id) => purchaseSummaryFor(summaries, id).totalCostCents);
    expect(costs).toEqual([334, 333, 333]);
    const purchases = await t.db.selectFrom("purchase").selectAll().where("item_id", "in", ids).execute();
    expect(purchases).toHaveLength(3);
    expect(purchases.every((row) => row.quantity === 1 && row.source === "Estate sale" && row.purchased_at === "2026-11-15")).toBe(true);
    const first = await loadItemDetail(t.db, t.userId, ids[0] ?? "", TODAY);
    expect(first).toMatchObject({ title: "Lot item A", quantityOnHand: 1, storageLocation: "Bin 3", categoryPath: "Movie › DVD" });
  });

  it("creates nothing if one line has a bad category", async () => {
    await expect(
      createLot(t.db, t.userId, {
        totalCostCents: 500,
        purchasedAt: "2026-11-15",
        source: null,
        storageLocation: null,
        lines: [
          { title: "Lot rollback A", categoryId: bookId },
          { title: "Lot rollback B", categoryId: "00000000-0000-4000-8000-000000000002" },
        ],
      }),
    ).rejects.toBeInstanceOf(DomainError);
    const rows = await t.db.selectFrom("inventory_item").select("id").where("title", "like", "Lot rollback%").execute();
    expect(rows).toEqual([]);
  });
});

describe("findDuplicateItems", () => {
  let matrixId: string;
  let otherId: string;

  beforeAll(async () => {
    matrixId = await createItem(
      t.db,
      t.userId,
      newItem({ title: "The Matrix (dupe test)", categoryId: dvdId, identifiers: [{ type: "upc", value: "085391737322" }] }),
    );
    otherId = await createItem(t.db, t.userId, newItem({ title: "Unrelated dupe-test item", categoryId: dvdId }));
  });

  it("matches a title ignoring case and extra spaces", async () => {
    const matches = await findDuplicateItems(t.db, t.userId, { title: "  the  MATRIX (Dupe Test) ", identifiers: [] });
    expect(matches).toEqual([
      { id: matrixId, title: "The Matrix (dupe test)", quantityOnHand: 2, matchedOn: "title", identifier: null },
    ]);
  });

  it("matches an identifier however it was typed, and lists it as an identifier match", async () => {
    const matches = await findDuplicateItems(t.db, t.userId, {
      title: "Some other name",
      identifiers: [{ type: "upc", value: "0-85391-73732-2" }],
    });
    expect(matches).toEqual([
      expect.objectContaining({ id: matrixId, matchedOn: "identifier", identifier: { type: "upc", value: "085391737322" } }),
    ]);
  });

  it("matches a UPC scanned as a 13-digit EAN", async () => {
    const matches = await findDuplicateItems(t.db, t.userId, {
      title: "",
      identifiers: [{ type: "ean", value: "0085391737322" }],
    });
    expect(matches.map((match) => match.id)).toEqual([matrixId]);
  });

  it("returns one row for an item that matches both ways, identifier first", async () => {
    const matches = await findDuplicateItems(t.db, t.userId, {
      title: "Unrelated dupe-test item",
      identifiers: [{ type: "upc", value: "085391737322" }],
    });
    expect(matches.map((match) => [match.id, match.matchedOn])).toEqual([
      [matrixId, "identifier"],
      [otherId, "title"],
    ]);
  });

  it("finds nothing for a new title, a partial title or a blank form", async () => {
    expect(await findDuplicateItems(t.db, t.userId, { title: "Never seen before", identifiers: [] })).toEqual([]);
    expect(await findDuplicateItems(t.db, t.userId, { title: "The Matrix", identifiers: [] })).toEqual([]);
    expect(await findDuplicateItems(t.db, t.userId, { title: "  ", identifiers: [{ type: "upc", value: "--" }] })).toEqual([]);
  });

  it("never matches another user's items", async () => {
    const other = await t.db.insertInto("app_user").values({ email: "other@second-story.test" }).returning("id").executeTakeFirstOrThrow();
    const matches = await findDuplicateItems(t.db, other.id, {
      title: "The Matrix (dupe test)",
      identifiers: [{ type: "upc", value: "085391737322" }],
    });
    expect(matches).toEqual([]);
  });
});

describe("editing an item", () => {
  it("updates the fields", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Edit test" }));
    await updateItemDetails(t.db, t.userId, id, {
      title: "Edit test, renamed",
      categoryId: dvdId,
      condition: null,
      storageLocation: "Bin 7",
      notes: "Scratched case",
      description: "Two-disc edition",
    });
    expect(await loadItemDetail(t.db, t.userId, id, TODAY)).toMatchObject({
      title: "Edit test, renamed",
      categoryId: dvdId,
      categoryName: "DVD",
      toneKey: movieId,
      condition: null,
      storageLocation: "Bin 7",
      notes: "Scratched case",
      description: "Two-disc edition",
    });
  });

  it("adds an identifier once and removes it", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Identifier test" }));
    await addIdentifier(t.db, t.userId, id, { type: "ean", value: "50 12345 67890 0" });
    await addIdentifier(t.db, t.userId, id, { type: "ean", value: "5012345678900" });
    await expect(addIdentifier(t.db, t.userId, id, { type: "upc", value: "n/a" })).rejects.toMatchObject({ code: "invalid" });
    const detail = await loadItemDetail(t.db, t.userId, id, TODAY);
    expect(detail?.identifiers.map(({ type, value }) => ({ type, value }))).toEqual([{ type: "ean", value: "5012345678900" }]);
    await removeIdentifier(t.db, t.userId, id, detail?.identifiers[0]?.id ?? "");
    expect((await loadItemDetail(t.db, t.userId, id, TODAY))?.identifiers).toEqual([]);
  });

  it("changes the category of several items at once", async () => {
    const a = await createItem(t.db, t.userId, newItem({ title: "Bulk A" }));
    const b = await createItem(t.db, t.userId, newItem({ title: "Bulk B" }));
    expect(await changeCategory(t.db, t.userId, [a, b], dvdId)).toBe(2);
    expect((await loadItemDetail(t.db, t.userId, a, TODAY))?.categoryId).toBe(dvdId);
    expect((await loadItemDetail(t.db, t.userId, b, TODAY))?.categoryId).toBe(dvdId);
    expect(await changeCategory(t.db, t.userId, [], dvdId)).toBe(0);
    await expect(changeCategory(t.db, t.userId, [a], "00000000-0000-4000-8000-000000000003")).rejects.toBeInstanceOf(DomainError);
  });
});

describe("photos", () => {
  it("adds, reorders and deletes, keeping positions packed and the first photo as the thumbnail", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Photo test", photos: [photo("p1")] }));
    const second = await addPhoto(t.db, t.userId, id, photo("p2"));
    const third = await addPhoto(t.db, t.userId, id, photo("p3"));
    const before = await loadItemDetail(t.db, t.userId, id, TODAY);
    const first = before?.photos[0]?.id ?? "";
    expect(before?.photos.map((row) => row.publicId)).toEqual([photo("p1").publicId, photo("p2").publicId, photo("p3").publicId]);

    await reorderPhotos(t.db, t.userId, id, [third, first, second]);
    const rows = await loadInventoryRows(t.db, t.userId, TODAY);
    expect(rows.find((row) => row.id === id)?.thumbnailPublicId).toBe(photo("p3").publicId);

    await expect(reorderPhotos(t.db, t.userId, id, [third, first])).rejects.toMatchObject({ code: "invalid" });
    await expect(reorderPhotos(t.db, t.userId, id, [third, third, first])).rejects.toMatchObject({ code: "invalid" });

    expect(await deletePhoto(t.db, t.userId, id, third)).toBe(photo("p3").publicId);
    expect(await deletePhoto(t.db, t.userId, id, third)).toBeNull();
    const positions = await t.db.selectFrom("item_photo").select(["id", "position"]).where("item_id", "=", id).orderBy("position").execute();
    expect(positions).toEqual([
      { id: first, position: 0 },
      { id: second, position: 1 },
    ]);
  });

  it("refuses a photo outside the user's folder", async () => {
    const id = await createItem(t.db, t.userId, newItem({ title: "Photo guard" }));
    await expect(addPhoto(t.db, t.userId, id, photo("x", "someone-else"))).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("loadInventoryRows", () => {
  it("builds table rows with category path, cost, status, days held and identifiers", async () => {
    const id = await createItem(
      t.db,
      t.userId,
      newItem({
        title: "Row test",
        categoryId: dvdId,
        identifiers: [{ type: "upc", value: "111111111111" }],
        purchase: { quantity: 4, unitCostCents: 75, purchasedAt: "2026-09-20", source: null },
      }),
    );
    const listing = await t.db
      .insertInto("listing")
      .values({ user_id: t.userId, title: "Row test listing", status: "active", asking_price_cents: 600 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await t.db.insertInto("listing_item").values({ user_id: t.userId, listing_id: listing.id, item_id: id }).execute();

    const row = (await loadInventoryRows(t.db, t.userId, TODAY)).find((candidate) => candidate.id === id);
    expect(row).toEqual({
      id,
      title: "Row test",
      categoryId: dvdId,
      categoryName: "DVD",
      categoryPath: "Movie › DVD",
      toneKey: movieId,
      quantity: 4,
      avgUnitCostCents: 75,
      lastPurchasedAt: "2026-09-20",
      status: "listed",
      daysHeld: 64,
      identifiers: ["111111111111"],
      thumbnailPublicId: null,
    });

    const detail = await loadItemDetail(t.db, t.userId, id, TODAY);
    expect(detail?.status).toBe("listed");
    expect(detail?.listings).toEqual([
      expect.objectContaining({ listingId: listing.id, title: "Row test listing", status: "active", askingPriceCents: 600, quantityPerUnit: 1 }),
    ]);
  });

  it("returns null for an item that does not exist", async () => {
    expect(await loadItemDetail(t.db, t.userId, "00000000-0000-4000-8000-000000000004", TODAY)).toBeNull();
  });
});

describe("importItems", () => {
  const row = (overrides: Partial<ImportRow>): ImportRow => ({
    title: "Import row",
    categoryId: bookId,
    condition: null,
    storageLocation: null,
    description: null,
    notes: null,
    quantity: 1,
    unitCostCents: 100,
    purchasedAt: "2026-10-01",
    source: "Library sale",
    identifiers: [],
    ...overrides,
  });

  it("creates items, and merges rows that match an existing item or an earlier row", async () => {
    const existing = await createItem(
      t.db,
      t.userId,
      newItem({ title: "Import existing", identifiers: [{ type: "isbn13", value: "9782222222222" }] }),
    );
    const result = await importItems(
      t.db,
      t.userId,
      [
        row({ title: "Import new one", quantity: 2, unitCostCents: 150 }),
        row({ title: "Different title", identifiers: [{ type: "isbn13", value: "9782222222222" }], quantity: 3 }),
        row({ title: "import NEW one", unitCostCents: 300 }),
      ],
      { mergeDuplicates: true },
    );
    expect(result).toEqual({ created: 1, restocked: 2 });
    expect((await loadItemDetail(t.db, t.userId, existing, TODAY))?.quantityOnHand).toBe(5);
    const created = await t.db.selectFrom("inventory_item").select(["id", "quantity_on_hand"]).where("title", "=", "Import new one").execute();
    expect(created).toHaveLength(1);
    expect(created[0]?.quantity_on_hand).toBe(3);
    // (2 × $1.50 + 1 × $3.00) ÷ 3 = $2.00
    const summaries = await loadPurchaseSummaries(t.db, t.userId, [created[0]?.id ?? ""]);
    expect(purchaseSummaryFor(summaries, created[0]?.id ?? "").avgUnitCostCents).toBe(200);
  });

  it("creates a new item for every row when merging is off", async () => {
    const result = await importItems(t.db, t.userId, [row({ title: "Import twin" }), row({ title: "Import twin" })], {
      mergeDuplicates: false,
    });
    expect(result).toEqual({ created: 2, restocked: 0 });
  });

  it("saves nothing from a batch with a bad category", async () => {
    await expect(
      importItems(
        t.db,
        t.userId,
        [row({ title: "Import rollback" }), row({ title: "Import bad", categoryId: "00000000-0000-4000-8000-000000000005" })],
        { mergeDuplicates: false },
      ),
    ).rejects.toBeInstanceOf(DomainError);
    const rows = await t.db.selectFrom("inventory_item").select("id").where("title", "=", "Import rollback").execute();
    expect(rows).toEqual([]);
  });
});
