import { sql } from "kysely";
import type { Db, DbOrTrx } from "@/lib/db";
import {
  DomainError,
  categoriesById,
  categoryPath,
  deriveItemStatus,
  loadActivelyListedItemIds,
  loadCategories,
  loadPurchaseSummaries,
  purchaseSummaryFor,
  topLevelCategoryId,
  type PurchaseSummary,
} from "@/lib/domain";
import type { IdentifierType, ItemStatus, ListingStatus } from "@/lib/schemas";
import { isOwnPublicId } from "./cloudinary-sign";
import {
  cleanIdentifiers,
  daysHeld,
  identifierMatchValues,
  lotUnitCosts,
  normalizeTitleForMatch,
  type IdentifierValue,
  type InventoryRow,
} from "./logic";
import type { ImportRow, PhotoInput } from "./schemas";

/**
 * Inventory reads and writes. Every function takes the database and the user id, so tests can pass an in-memory database.
 * Functions that take `Db` open their own transaction. Do not call them from inside another transaction.
 */

export interface PurchaseInput {
  quantity: number;
  unitCostCents: number;
  /** "YYYY-MM-DD". */
  purchasedAt: string;
  source: string | null;
}

export interface ItemDetailsInput {
  title: string;
  categoryId: string;
  condition: string | null;
  storageLocation: string | null;
  notes: string | null;
  description?: string | null;
}

export interface NewItemInput extends ItemDetailsInput {
  identifiers: readonly { type: IdentifierType; value: string }[];
  photos: readonly PhotoInput[];
  purchase: PurchaseInput;
}

async function assertCategory(db: DbOrTrx, userId: string, categoryId: string): Promise<void> {
  const category = await db
    .selectFrom("category")
    .select("id")
    .where("id", "=", categoryId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!category) throw new DomainError("invalid", "That category does not exist. Choose another one.");
}

async function assertItem(db: DbOrTrx, userId: string, itemId: string): Promise<void> {
  const item = await db
    .selectFrom("inventory_item")
    .select("id")
    .where("id", "=", itemId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!item) throw new DomainError("not_found", "That item does not exist.");
}

function assertOwnPhotos(photos: readonly PhotoInput[], userId: string): void {
  if (photos.some((photo) => !isOwnPublicId(photo.publicId, userId))) {
    throw new DomainError("invalid", "A photo could not be saved. Upload it again.");
  }
}

/** Inserts an item with its first purchase, identifiers and photos. Call it inside a transaction. */
async function insertItem(trx: DbOrTrx, userId: string, input: NewItemInput): Promise<string> {
  assertOwnPhotos(input.photos, userId);
  const item = await trx
    .insertInto("inventory_item")
    .values({
      user_id: userId,
      title: input.title,
      category_id: input.categoryId,
      condition: input.condition,
      storage_location: input.storageLocation,
      notes: input.notes,
      description: input.description ?? null,
      quantity_on_hand: input.purchase.quantity,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await trx
    .insertInto("purchase")
    .values({
      user_id: userId,
      item_id: item.id,
      purchased_at: input.purchase.purchasedAt,
      quantity: input.purchase.quantity,
      unit_cost_cents: input.purchase.unitCostCents,
      source: input.purchase.source,
    })
    .execute();
  const identifiers = cleanIdentifiers(input.identifiers);
  if (identifiers.length > 0) {
    await trx
      .insertInto("item_identifier")
      .values(identifiers.map((identifier) => ({ user_id: userId, item_id: item.id, ...identifier })))
      .execute();
  }
  if (input.photos.length > 0) {
    await trx
      .insertInto("item_photo")
      .values(
        input.photos.map((photo, position) => ({
          user_id: userId,
          item_id: item.id,
          cloudinary_public_id: photo.publicId,
          width: photo.width,
          height: photo.height,
          position,
        })),
      )
      .execute();
  }
  return item.id;
}

/** Records a purchase and raises the quantity on hand by the same amount. Call it inside a transaction. */
async function insertPurchase(trx: DbOrTrx, userId: string, itemId: string, purchase: PurchaseInput): Promise<void> {
  // The increment happens in SQL, so two purchases saved at the same moment both count.
  const updated = await trx
    .updateTable("inventory_item")
    .set((eb) => ({ quantity_on_hand: eb("quantity_on_hand", "+", purchase.quantity), updated_at: new Date() }))
    .where("id", "=", itemId)
    .where("user_id", "=", userId)
    .returning("id")
    .executeTakeFirst();
  if (!updated) throw new DomainError("not_found", "That item does not exist.");
  await trx
    .insertInto("purchase")
    .values({
      user_id: userId,
      item_id: itemId,
      purchased_at: purchase.purchasedAt,
      quantity: purchase.quantity,
      unit_cost_cents: purchase.unitCostCents,
      source: purchase.source,
    })
    .execute();
}

/** Creates an item and records its first purchase. Returns the new item's id. */
export async function createItem(db: Db, userId: string, input: NewItemInput): Promise<string> {
  return db.transaction().execute(async (trx) => {
    await assertCategory(trx, userId, input.categoryId);
    return insertItem(trx, userId, input);
  });
}

/** "Add stock": records another purchase of an existing item, with its own date and cost. */
export async function addStock(db: Db, userId: string, itemId: string, purchase: PurchaseInput): Promise<void> {
  await db.transaction().execute((trx) => insertPurchase(trx, userId, itemId, purchase));
}

export interface LotInput {
  /** What the whole lot cost. */
  totalCostCents: number;
  purchasedAt: string;
  source: string | null;
  storageLocation: string | null;
  /** One line per item. Each line is one unit. */
  lines: readonly { title: string; categoryId: string }[];
}

/**
 * Creates one item per line of a lot bought for one price.
 * The price is split evenly, one purchase row each. If the split leaves a remainder, the extra cents go to the first item.
 * Returns the new item ids in line order.
 */
export async function createLot(db: Db, userId: string, input: LotInput): Promise<string[]> {
  if (input.lines.length === 0) throw new DomainError("invalid", "A lot needs at least one item.");
  const costs = lotUnitCosts(input.totalCostCents, input.lines.length);
  return db.transaction().execute(async (trx) => {
    const ids: string[] = [];
    for (const [index, line] of input.lines.entries()) {
      await assertCategory(trx, userId, line.categoryId);
      ids.push(
        await insertItem(trx, userId, {
          title: line.title,
          categoryId: line.categoryId,
          condition: null,
          storageLocation: input.storageLocation,
          notes: null,
          identifiers: [],
          photos: [],
          purchase: {
            quantity: 1,
            unitCostCents: costs[index] ?? 0,
            purchasedAt: input.purchasedAt,
            source: input.source,
          },
        }),
      );
    }
    return ids;
  });
}

export interface DuplicateMatch {
  id: string;
  title: string;
  quantityOnHand: number;
  /** An identifier match is listed before a title match. */
  matchedOn: "identifier" | "title";
  /** The stored identifier that matched, if that is how it was found. */
  identifier: IdentifierValue | null;
}

const MAX_DUPLICATE_MATCHES = 5;

/**
 * Finds existing items that look like the one being added, so the form can offer "add stock" instead.
 * An item matches if one of its identifiers has the same normalized value, or its title is the same ignoring case and extra spaces.
 */
export async function findDuplicateItems(
  db: DbOrTrx,
  userId: string,
  input: { title: string; identifiers: readonly { type: IdentifierType; value: string }[] },
): Promise<DuplicateMatch[]> {
  const matches = new Map<string, DuplicateMatch>();
  const values = identifierMatchValues(cleanIdentifiers(input.identifiers));
  if (values.length > 0) {
    const rows = await db
      .selectFrom("item_identifier")
      .innerJoin("inventory_item", "inventory_item.id", "item_identifier.item_id")
      .select([
        "inventory_item.id",
        "inventory_item.title",
        "inventory_item.quantity_on_hand",
        "item_identifier.type",
        "item_identifier.value",
      ])
      .where("item_identifier.user_id", "=", userId)
      .where("item_identifier.value", "in", values)
      .orderBy("inventory_item.created_at")
      .execute();
    for (const row of rows) {
      if (matches.has(row.id)) continue;
      matches.set(row.id, {
        id: row.id,
        title: row.title,
        quantityOnHand: row.quantity_on_hand,
        matchedOn: "identifier",
        identifier: { type: row.type, value: row.value },
      });
    }
  }
  const titleKey = normalizeTitleForMatch(input.title);
  if (titleKey !== "") {
    const rows = await db
      .selectFrom("inventory_item")
      .select(["id", "title", "quantity_on_hand"])
      .where("user_id", "=", userId)
      // The same rule as normalizeTitleForMatch.
      .where(sql<string>`lower(btrim(regexp_replace(title, '\\s+', ' ', 'g')))`, "=", titleKey)
      .orderBy("created_at")
      .execute();
    for (const row of rows) {
      if (matches.has(row.id)) continue;
      matches.set(row.id, {
        id: row.id,
        title: row.title,
        quantityOnHand: row.quantity_on_hand,
        matchedOn: "title",
        identifier: null,
      });
    }
  }
  return [...matches.values()].slice(0, MAX_DUPLICATE_MATCHES);
}

/** Saves the editable fields of an item. */
export async function updateItemDetails(db: Db, userId: string, itemId: string, details: ItemDetailsInput): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await assertCategory(trx, userId, details.categoryId);
    const updated = await trx
      .updateTable("inventory_item")
      .set({
        title: details.title,
        category_id: details.categoryId,
        condition: details.condition,
        storage_location: details.storageLocation,
        notes: details.notes,
        description: details.description ?? null,
        updated_at: new Date(),
      })
      .where("id", "=", itemId)
      .where("user_id", "=", userId)
      .returning("id")
      .executeTakeFirst();
    if (!updated) throw new DomainError("not_found", "That item does not exist.");
  });
}

/**
 * Sets the quantity on hand by hand, for corrections such as a lost or damaged unit.
 * No purchase row is written, so the average unit cost does not change.
 */
export async function correctQuantity(db: DbOrTrx, userId: string, itemId: string, quantity: number): Promise<void> {
  const updated = await db
    .updateTable("inventory_item")
    .set({ quantity_on_hand: quantity, updated_at: new Date() })
    .where("id", "=", itemId)
    .where("user_id", "=", userId)
    .returning("id")
    .executeTakeFirst();
  if (!updated) throw new DomainError("not_found", "That item does not exist.");
}

/** Bulk action: moves items to another category. Returns how many items changed. */
export async function changeCategory(db: Db, userId: string, itemIds: readonly string[], categoryId: string): Promise<number> {
  if (itemIds.length === 0) return 0;
  return db.transaction().execute(async (trx) => {
    await assertCategory(trx, userId, categoryId);
    const updated = await trx
      .updateTable("inventory_item")
      .set({ category_id: categoryId, updated_at: new Date() })
      .where("user_id", "=", userId)
      .where("id", "in", [...itemIds])
      .returning("id")
      .execute();
    return updated.length;
  });
}

/**
 * Adds an identifier to an item. The value is normalized for its type first.
 * If the item already has that identifier, nothing changes.
 */
export async function addIdentifier(
  db: Db,
  userId: string,
  itemId: string,
  identifier: { type: IdentifierType; value: string },
): Promise<void> {
  const [clean] = cleanIdentifiers([identifier]);
  if (!clean) throw new DomainError("invalid", "Enter an identifier.");
  await db.transaction().execute(async (trx) => {
    await assertItem(trx, userId, itemId);
    await trx
      .insertInto("item_identifier")
      .values({ user_id: userId, item_id: itemId, ...clean })
      .onConflict((conflict) => conflict.columns(["item_id", "type", "value"]).doNothing())
      .execute();
  });
}

export async function removeIdentifier(db: DbOrTrx, userId: string, itemId: string, identifierId: string): Promise<void> {
  await db
    .deleteFrom("item_identifier")
    .where("id", "=", identifierId)
    .where("item_id", "=", itemId)
    .where("user_id", "=", userId)
    .execute();
}

async function photoIdsInOrder(trx: DbOrTrx, userId: string, itemId: string): Promise<string[]> {
  const rows = await trx
    .selectFrom("item_photo")
    .select("id")
    .where("item_id", "=", itemId)
    .where("user_id", "=", userId)
    .orderBy("position")
    .orderBy("created_at")
    .execute();
  return rows.map((row) => row.id);
}

async function writePhotoPositions(trx: DbOrTrx, userId: string, itemId: string, orderedIds: readonly string[]): Promise<void> {
  for (const [position, id] of orderedIds.entries()) {
    await trx
      .updateTable("item_photo")
      .set({ position })
      .where("id", "=", id)
      .where("item_id", "=", itemId)
      .where("user_id", "=", userId)
      .execute();
  }
}

/** Adds an uploaded photo after the item's existing ones. Returns the photo row id. */
export async function addPhoto(db: Db, userId: string, itemId: string, photo: PhotoInput): Promise<string> {
  assertOwnPhotos([photo], userId);
  return db.transaction().execute(async (trx) => {
    await assertItem(trx, userId, itemId);
    const existing = await photoIdsInOrder(trx, userId, itemId);
    const row = await trx
      .insertInto("item_photo")
      .values({
        user_id: userId,
        item_id: itemId,
        cloudinary_public_id: photo.publicId,
        width: photo.width,
        height: photo.height,
        position: existing.length,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  });
}

/**
 * Saves a new photo order. The first id becomes the thumbnail.
 * `orderedIds` must hold exactly the item's current photo ids. If it does not, nothing changes and it throws.
 */
export async function reorderPhotos(db: Db, userId: string, itemId: string, orderedIds: readonly string[]): Promise<void> {
  await db.transaction().execute(async (trx) => {
    const current = await photoIdsInOrder(trx, userId, itemId);
    const wanted = new Set(orderedIds);
    if (wanted.size !== orderedIds.length || wanted.size !== current.length || current.some((id) => !wanted.has(id))) {
      throw new DomainError("invalid", "The photos changed. Reload the page and try again.");
    }
    await writePhotoPositions(trx, userId, itemId, orderedIds);
  });
}

/**
 * Deletes a photo row and closes the gap in the positions.
 * Returns the Cloudinary public id so the caller can delete the file, or null if the photo was already gone.
 */
export async function deletePhoto(db: Db, userId: string, itemId: string, photoId: string): Promise<string | null> {
  return db.transaction().execute(async (trx) => {
    const deleted = await trx
      .deleteFrom("item_photo")
      .where("id", "=", photoId)
      .where("item_id", "=", itemId)
      .where("user_id", "=", userId)
      .returning("cloudinary_public_id")
      .executeTakeFirst();
    if (!deleted) return null;
    await writePhotoPositions(trx, userId, itemId, await photoIdsInOrder(trx, userId, itemId));
    return deleted.cloudinary_public_id;
  });
}

export type InventoryRowData = Omit<InventoryRow, "thumbnailUrl"> & {
  /** The first photo's Cloudinary public id, or null. The page turns it into a URL. */
  thumbnailPublicId: string | null;
};

/** Loads every item as a row for the inventory table, newest first. */
export async function loadInventoryRows(db: DbOrTrx, userId: string, today: string): Promise<InventoryRowData[]> {
  const [items, categories, summaries, listedIds, photos, identifiers] = [
    await db
      .selectFrom("inventory_item")
      .select(["id", "title", "category_id", "quantity_on_hand"])
      .where("user_id", "=", userId)
      .orderBy("created_at", "desc")
      .orderBy("title")
      .execute(),
    await loadCategories(db, userId),
    await loadPurchaseSummaries(db, userId),
    await loadActivelyListedItemIds(db, userId),
    await db
      .selectFrom("item_photo")
      .select(["item_id", "cloudinary_public_id"])
      .where("user_id", "=", userId)
      .orderBy("position", "desc")
      .orderBy("created_at", "desc")
      .execute(),
    await db.selectFrom("item_identifier").select(["item_id", "value"]).where("user_id", "=", userId).execute(),
  ];
  const byId = categoriesById(categories);
  // Rows come lowest position last, so the last write for an item is its first photo.
  const thumbnailByItem = new Map(photos.map((photo) => [photo.item_id, photo.cloudinary_public_id]));
  const identifiersByItem = new Map<string, string[]>();
  for (const identifier of identifiers) {
    const list = identifiersByItem.get(identifier.item_id) ?? [];
    list.push(identifier.value);
    identifiersByItem.set(identifier.item_id, list);
  }
  return items.map((item) => {
    const summary = purchaseSummaryFor(summaries, item.id);
    return {
      id: item.id,
      title: item.title,
      categoryId: item.category_id,
      categoryName: byId.get(item.category_id)?.name ?? "",
      categoryPath: categoryPath(item.category_id, byId),
      toneKey: topLevelCategoryId(item.category_id, byId),
      quantity: item.quantity_on_hand,
      avgUnitCostCents: summary.avgUnitCostCents,
      lastPurchasedAt: summary.lastPurchasedAt,
      status: deriveItemStatus({ quantityOnHand: item.quantity_on_hand, inActiveListing: listedIds.has(item.id) }),
      daysHeld: daysHeld({ quantityOnHand: item.quantity_on_hand, lastPurchasedAt: summary.lastPurchasedAt, today }),
      identifiers: identifiersByItem.get(item.id) ?? [],
      thumbnailPublicId: thumbnailByItem.get(item.id) ?? null,
    };
  });
}

export interface ItemDetail {
  id: string;
  title: string;
  description: string | null;
  categoryId: string;
  categoryName: string;
  categoryPath: string;
  toneKey: string;
  condition: string | null;
  storageLocation: string | null;
  notes: string | null;
  quantityOnHand: number;
  status: ItemStatus;
  daysHeld: number | null;
  summary: PurchaseSummary;
  identifiers: (IdentifierValue & { id: string })[];
  photos: { id: string; publicId: string; width: number; height: number }[];
  /** Newest first. */
  purchases: { id: string; purchasedAt: string; quantity: number; unitCostCents: number; source: string | null }[];
  /** Every listing the item is or was part of, newest first. */
  listings: {
    listingId: string;
    title: string;
    status: ListingStatus;
    askingPriceCents: number;
    quantityPerUnit: number;
    listedAt: Date | null;
    createdAt: Date;
  }[];
}

/** Loads everything the item page shows. Returns null if the item does not exist. */
export async function loadItemDetail(db: DbOrTrx, userId: string, itemId: string, today: string): Promise<ItemDetail | null> {
  const item = await db
    .selectFrom("inventory_item")
    .select(["id", "title", "description", "category_id", "condition", "storage_location", "notes", "quantity_on_hand"])
    .where("id", "=", itemId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!item) return null;
  const categories = await loadCategories(db, userId);
  const byId = categoriesById(categories);
  const summary = purchaseSummaryFor(await loadPurchaseSummaries(db, userId, [item.id]), item.id);
  const identifiers = await db
    .selectFrom("item_identifier")
    .select(["id", "type", "value"])
    .where("item_id", "=", item.id)
    .where("user_id", "=", userId)
    .orderBy("type")
    .orderBy("value")
    .execute();
  const photos = await db
    .selectFrom("item_photo")
    .select(["id", "cloudinary_public_id", "width", "height"])
    .where("item_id", "=", item.id)
    .where("user_id", "=", userId)
    .orderBy("position")
    .orderBy("created_at")
    .execute();
  const purchases = await db
    .selectFrom("purchase")
    .select(["id", "purchased_at", "quantity", "unit_cost_cents", "source"])
    .where("item_id", "=", item.id)
    .where("user_id", "=", userId)
    .orderBy("purchased_at", "desc")
    .orderBy("created_at", "desc")
    .execute();
  const listings = await db
    .selectFrom("listing_item")
    .innerJoin("listing", "listing.id", "listing_item.listing_id")
    .select([
      "listing.id",
      "listing.title",
      "listing.status",
      "listing.asking_price_cents",
      "listing.listed_at",
      "listing.created_at",
      "listing_item.quantity_per_unit",
    ])
    .where("listing_item.item_id", "=", item.id)
    .where("listing_item.user_id", "=", userId)
    .orderBy("listing.created_at", "desc")
    .execute();
  const inActiveListing = listings.some((listing) => listing.status === "active");
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    categoryId: item.category_id,
    categoryName: byId.get(item.category_id)?.name ?? "",
    categoryPath: categoryPath(item.category_id, byId),
    toneKey: topLevelCategoryId(item.category_id, byId),
    condition: item.condition,
    storageLocation: item.storage_location,
    notes: item.notes,
    quantityOnHand: item.quantity_on_hand,
    status: deriveItemStatus({ quantityOnHand: item.quantity_on_hand, inActiveListing }),
    daysHeld: daysHeld({ quantityOnHand: item.quantity_on_hand, lastPurchasedAt: summary.lastPurchasedAt, today }),
    summary,
    identifiers,
    photos: photos.map((photo) => ({
      id: photo.id,
      publicId: photo.cloudinary_public_id,
      width: photo.width,
      height: photo.height,
    })),
    purchases: purchases.map((purchase) => ({
      id: purchase.id,
      purchasedAt: purchase.purchased_at,
      quantity: purchase.quantity,
      unitCostCents: purchase.unit_cost_cents,
      source: purchase.source,
    })),
    listings: listings.map((listing) => ({
      listingId: listing.id,
      title: listing.title,
      status: listing.status,
      askingPriceCents: listing.asking_price_cents,
      quantityPerUnit: listing.quantity_per_unit,
      listedAt: listing.listed_at,
      createdAt: listing.created_at,
    })),
  };
}

export interface ImportResult {
  /** New items created. */
  created: number;
  /** Rows that added stock to an existing item instead. */
  restocked: number;
}

/**
 * Imports one batch of CSV rows in a single transaction, so a batch is saved whole or not at all.
 * If `mergeDuplicates` is true, a row whose title or identifier matches an existing item adds stock to that item.
 * Rows are handled in order, so a later row can match an item an earlier row created.
 */
export async function importItems(
  db: Db,
  userId: string,
  rows: readonly ImportRow[],
  options: { mergeDuplicates: boolean },
): Promise<ImportResult> {
  return db.transaction().execute(async (trx) => {
    const knownCategories = new Set((await loadCategories(trx, userId)).map((category) => category.id));
    const result: ImportResult = { created: 0, restocked: 0 };
    for (const row of rows) {
      if (!knownCategories.has(row.categoryId)) {
        throw new DomainError("invalid", `"${row.title}" has a category that does not exist.`);
      }
      const purchase: PurchaseInput = {
        quantity: row.quantity,
        unitCostCents: row.unitCostCents,
        purchasedAt: row.purchasedAt,
        source: row.source,
      };
      const match = options.mergeDuplicates ? (await findDuplicateItems(trx, userId, row))[0] : undefined;
      if (match) {
        await insertPurchase(trx, userId, match.id, purchase);
        result.restocked += 1;
      } else {
        await insertItem(trx, userId, { ...row, photos: [], purchase });
        result.created += 1;
      }
    }
    return result;
  });
}
