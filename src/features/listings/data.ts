import "server-only";

import { cloudinaryImageUrl } from "@/lib/cloudinary";
import type { Db, DbOrTrx } from "@/lib/db";
import {
  categoriesById,
  categoryPath,
  DomainError,
  listingCostFor,
  loadCategories,
  loadFeeRules,
  loadListingCosts,
  loadListingSoldQuantities,
  loadPurchaseSummaries,
  projectListingMarketplace,
  purchaseSummaryFor,
  resolveFeeTerms,
  saleRowProfit,
  STALE_LISTING_DAYS,
  topLevelCategoryId,
  type ListingMarketplaceProjection,
} from "@/lib/domain";
import { centsToInputValue, daysBetween, todayIsoDate, toIsoDate } from "@/lib/format";
import type { ListingStatus } from "@/lib/schemas";
import type { ListingFormInput } from "./schemas";
import type {
  ListingDetail,
  ListingDetailMarketplace,
  ListingFormOptions,
  ListingItemOption,
  ListingRow,
  ListingRowMarketplace,
  MarketplaceOption,
} from "./types";

function compareText(a: string, b: string): number {
  return a.localeCompare(b, "en", { sensitivity: "base", numeric: true });
}

interface MarketplaceRowWithProjection extends ListingRowMarketplace {
  projection: ListingMarketplaceProjection;
}

/**
 * The rows that count for a listing's minimum price and below-minimum flag.
 * If the listing is active, only the marketplaces it is still up on count.
 * A draft, sold or ended listing uses every marketplace it has.
 */
function pricedRows<T extends { status: "active" | "ended" }>(status: ListingStatus, rows: readonly T[]): T[] {
  return status === "active" ? rows.filter((row) => row.status === "active") : [...rows];
}

/** The highest minimum across the rows. Null if there are no rows, or if one of them has no price that breaks even. */
export function highestMinimumPriceCents(minimums: readonly (number | null)[]): number | null {
  let highest: number | null = null;
  for (const minimum of minimums) {
    if (minimum === null) return null;
    if (highest === null || minimum > highest) highest = minimum;
  }
  return highest;
}

function daysListedFor(
  listing: { status: ListingStatus; listed_at: Date | null; ended_at: Date | null },
  today: string,
): number | null {
  if (listing.status === "draft" || !listing.listed_at) return null;
  const end = listing.status !== "active" && listing.ended_at ? listing.ended_at : today;
  const days = daysBetween(listing.listed_at, end);
  return days === null ? null : Math.max(0, days);
}

async function loadProjectedMarketplaces(
  db: DbOrTrx,
  userId: string,
  listings: readonly {
    id: string;
    asking_price_cents: number;
    shipping_charged_cents: number;
    est_shipping_cost_cents: number;
    commission_bps: number | null;
  }[],
): Promise<Map<string, MarketplaceRowWithProjection[]>> {
  const result = new Map<string, MarketplaceRowWithProjection[]>();
  if (listings.length === 0) return result;
  const listingIds = listings.map((listing) => listing.id);
  const [rows, costs, rules, categories] = await Promise.all([
    db
      .selectFrom("listing_marketplace")
      .innerJoin("marketplace", "marketplace.id", "listing_marketplace.marketplace_id")
      .select([
        "listing_marketplace.listing_id",
        "listing_marketplace.marketplace_id",
        "listing_marketplace.status",
        "listing_marketplace.external_url",
        "listing_marketplace.asking_price_cents",
        "marketplace.name",
      ])
      .where("listing_marketplace.user_id", "=", userId)
      .where("listing_marketplace.listing_id", "in", listingIds)
      .execute(),
    loadListingCosts(db, userId, listingIds),
    loadFeeRules(db, userId),
    loadCategories(db, userId),
  ]);
  const byId = categoriesById(categories);
  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  // Sorted here, not in SQL: the local database and Neon order mixed-case names ("eBay", "Mercari") differently.
  rows.sort((a, b) => compareText(a.name, b.name));
  for (const row of rows) {
    const listing = listingById.get(row.listing_id);
    if (!listing) continue;
    const cost = listingCostFor(costs, listing.id);
    const projection = projectListingMarketplace({
      listing: {
        askingPriceCents: listing.asking_price_cents,
        shippingChargedCents: listing.shipping_charged_cents,
        estShippingCostCents: listing.est_shipping_cost_cents,
        commissionBps: listing.commission_bps,
      },
      marketplaceAskingPriceCents: row.asking_price_cents,
      unitCostCents: cost.unitCostCents,
      rule: resolveFeeTerms(rules, row.marketplace_id, cost.feeCategoryId, byId),
    });
    const list = result.get(listing.id) ?? [];
    list.push({
      marketplaceId: row.marketplace_id,
      name: row.name,
      status: row.status,
      externalUrl: row.external_url,
      projection,
    });
    result.set(listing.id, list);
  }
  return result;
}

/** Every listing the user has, as rows for the listings table. Newest first. */
export async function loadListingRows(db: DbOrTrx, userId: string, today: string = todayIsoDate()): Promise<ListingRow[]> {
  const listings = await db
    .selectFrom("listing")
    .select([
      "id",
      "title",
      "status",
      "asking_price_cents",
      "quantity",
      "shipping_charged_cents",
      "est_shipping_cost_cents",
      "commission_bps",
      "listed_at",
      "ended_at",
      "created_at",
    ])
    .where("user_id", "=", userId)
    .orderBy("created_at", "desc")
    .orderBy("id")
    .execute();
  const [marketplaces, sold] = await Promise.all([
    loadProjectedMarketplaces(db, userId, listings),
    loadListingSoldQuantities(db, userId),
  ]);

  return listings.map((listing) => {
    const rows = marketplaces.get(listing.id) ?? [];
    const priced = pricedRows(listing.status, rows);
    const daysListed = daysListedFor(listing, today);
    const soldQuantity = sold.get(listing.id) ?? 0;
    return {
      id: listing.id,
      title: listing.title,
      status: listing.status,
      marketplaces: rows.map(({ marketplaceId, name, status, externalUrl }) => ({ marketplaceId, name, status, externalUrl })),
      askingPriceCents: listing.asking_price_cents,
      minimumPriceCents: highestMinimumPriceCents(priced.map((row) => row.projection.minimumPriceCents)),
      belowMinimum: priced.some((row) => row.projection.belowMinimum),
      daysListed,
      quantity: listing.quantity,
      soldQuantity,
      stale: listing.status === "active" && daysListed !== null && daysListed > STALE_LISTING_DAYS,
      stillUpCount: listing.status === "sold" ? rows.filter((row) => row.status === "active").length : 0,
    };
  });
}

/**
 * What the listing form offers: items with stock, marketplaces that are not archived, fee rules, categories and the default commission.
 * Pass the listing's own item and marketplace ids so they stay on the form if the item has since sold out or the marketplace was archived.
 */
export async function loadListingFormOptions(
  db: DbOrTrx,
  userId: string,
  keep: { itemIds?: readonly string[]; marketplaceIds?: readonly string[] } = {},
): Promise<ListingFormOptions> {
  const keepItemIds = [...(keep.itemIds ?? [])];
  const keepMarketplaceIds = [...(keep.marketplaceIds ?? [])];

  const [itemRows, marketplaceRows, feeRules, categories, settings] = await Promise.all([
    db
      .selectFrom("inventory_item")
      .select(["id", "title", "category_id", "quantity_on_hand"])
      .where("user_id", "=", userId)
      .where((eb) =>
        keepItemIds.length > 0
          ? eb.or([eb("quantity_on_hand", ">", 0), eb("id", "in", keepItemIds)])
          : eb("quantity_on_hand", ">", 0),
      )
      .orderBy("id")
      .execute(),
    db
      .selectFrom("marketplace")
      .select(["id", "name"])
      .where("user_id", "=", userId)
      .where((eb) =>
        keepMarketplaceIds.length > 0
          ? eb.or([eb("archived_at", "is", null), eb("id", "in", keepMarketplaceIds)])
          : eb("archived_at", "is", null),
      )
      .orderBy("created_at")
      .orderBy("id")
      .execute(),
    loadFeeRules(db, userId),
    loadCategories(db, userId),
    db
      .selectFrom("user_settings")
      .select(["default_commission_bps", "default_commission_payee"])
      .where("user_id", "=", userId)
      .executeTakeFirst(),
  ]);

  itemRows.sort((a, b) => compareText(a.title, b.title));
  const itemIds = itemRows.map((row) => row.id);
  // Run in order, not in Promise.all: with no items there is nothing to ask for, and "in ()" is not valid SQL.
  const summaries = await loadPurchaseSummaries(db, userId, itemIds);
  const identifiers =
    itemIds.length === 0
      ? []
      : await db
          .selectFrom("item_identifier")
          .select(["item_id", "value"])
          .where("user_id", "=", userId)
          .where("item_id", "in", itemIds)
          .execute();
  const photos =
    itemIds.length === 0
      ? []
      : await db
          .selectFrom("item_photo")
          .select(["item_id", "cloudinary_public_id"])
          .where("user_id", "=", userId)
          .where("item_id", "in", itemIds)
          .orderBy("position")
          .orderBy("id")
          .execute();

  const identifiersByItem = new Map<string, string[]>();
  for (const row of identifiers) {
    const list = identifiersByItem.get(row.item_id) ?? [];
    list.push(row.value);
    identifiersByItem.set(row.item_id, list);
  }
  const firstPhotoByItem = new Map<string, string>();
  for (const row of photos) {
    if (!firstPhotoByItem.has(row.item_id)) firstPhotoByItem.set(row.item_id, row.cloudinary_public_id);
  }

  const byId = categoriesById(categories);
  const items: ListingItemOption[] = itemRows.map((row) => {
    const photo = firstPhotoByItem.get(row.id);
    return {
      id: row.id,
      title: row.title,
      categoryId: row.category_id,
      categoryName: byId.get(row.category_id)?.name ?? "",
      categoryPath: categoryPath(row.category_id, byId),
      toneKey: topLevelCategoryId(row.category_id, byId),
      imageUrl: photo ? cloudinaryImageUrl(photo, { width: 40, height: 40 }) : null,
      quantityOnHand: row.quantity_on_hand,
      avgUnitCostCents: purchaseSummaryFor(summaries, row.id).avgUnitCostCents,
      searchText: [row.title, ...(identifiersByItem.get(row.id) ?? [])].join(" ").toLowerCase(),
    };
  });

  return {
    items,
    marketplaces: marketplaceRows,
    feeRules,
    categories,
    defaultCommissionBps: settings?.default_commission_bps ?? null,
    defaultCommissionPayee: settings?.default_commission_payee ?? null,
  };
}

/** One listing with its items, per-marketplace figures and sales. Null if it does not exist. */
export async function loadListingDetail(
  db: DbOrTrx,
  userId: string,
  listingId: string,
  today: string = todayIsoDate(),
): Promise<ListingDetail | null> {
  const listing = await db
    .selectFrom("listing")
    .selectAll()
    .where("id", "=", listingId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!listing) return null;

  const [marketplaces, costs, saleRows, overrides] = await Promise.all([
    loadProjectedMarketplaces(db, userId, [listing]),
    loadListingCosts(db, userId, [listing.id]),
    db
      .selectFrom("sale")
      .innerJoin("marketplace", "marketplace.id", "sale.marketplace_id")
      .select([
        "sale.id",
        "sale.sold_at",
        "sale.quantity",
        "sale.sale_price_cents",
        "sale.shipping_charged_cents",
        "sale.shipping_cost_cents",
        "sale.marketplace_fee_cents",
        "sale.additional_fees_cents",
        "sale.cost_of_goods_cents",
        "sale.commission_cents",
        "marketplace.name",
      ])
      .where("sale.user_id", "=", userId)
      .where("sale.listing_id", "=", listing.id)
      .orderBy("sale.sold_at", "desc")
      .orderBy("sale.id")
      .execute(),
    db
      .selectFrom("listing_marketplace")
      .select(["marketplace_id", "asking_price_cents"])
      .where("user_id", "=", userId)
      .where("listing_id", "=", listing.id)
      .execute(),
  ]);
  const cost = listingCostFor(costs, listing.id);
  const rows = marketplaces.get(listing.id) ?? [];
  const overrideByMarketplace = new Map(overrides.map((row) => [row.marketplace_id, row.asking_price_cents]));
  const formRows = pricedRows(listing.status === "ended" ? "active" : listing.status, rows);

  const detailMarketplaces: ListingDetailMarketplace[] = rows.map((row) => ({
    marketplaceId: row.marketplaceId,
    name: row.name,
    status: row.status,
    externalUrl: row.externalUrl,
    askingPriceCents: row.projection.askingPriceCents,
    minimumPriceCents: row.projection.minimumPriceCents,
    belowMinimum: row.projection.belowMinimum,
    projectedProfitCents: row.projection.atAsking.profitCents,
    projectedFeeCents: row.projection.atAsking.marketplaceFeeCents,
  }));

  return {
    values: {
      id: listing.id,
      status: listing.status,
      title: listing.title,
      askingPriceCents: listing.asking_price_cents,
      quantity: listing.quantity,
      shippingChargedCents: listing.shipping_charged_cents,
      estShippingCostCents: listing.est_shipping_cost_cents,
      commissionBps: listing.commission_bps,
      commissionPayee: listing.commission_payee ?? "",
      items: cost.items.map((item) => ({ itemId: item.itemId, quantityPerUnit: item.quantityPerUnit })),
      // The form's picked marketplaces are the ones the listing is up on. An ended listing starts with none picked.
      marketplaces: formRows.map((row) => {
        const override = overrideByMarketplace.get(row.marketplaceId) ?? null;
        return {
          marketplaceId: row.marketplaceId,
          url: row.externalUrl ?? "",
          price: override === null ? "" : centsToInputValue(override),
        };
      }),
      soldQuantity: saleRows.reduce((sum, sale) => sum + sale.quantity, 0),
    },
    listedAt: listing.listed_at ? toIsoDate(listing.listed_at) : null,
    endedAt: listing.ended_at ? toIsoDate(listing.ended_at) : null,
    daysListed: daysListedFor(listing, today),
    unitCostCents: cost.unitCostCents,
    items: cost.items.map((item) => ({
      itemId: item.itemId,
      title: item.title,
      quantityPerUnit: item.quantityPerUnit,
      avgUnitCostCents: item.avgUnitCostCents,
      quantityOnHand: item.quantityOnHand,
    })),
    marketplaces: detailMarketplaces,
    sales: saleRows.map((sale) => {
      const profit = saleRowProfit(sale);
      return {
        id: sale.id,
        soldAt: sale.sold_at,
        marketplaceName: sale.name,
        quantity: sale.quantity,
        revenueCents: profit.revenueCents,
        profitCents: profit.profitCents,
      };
    }),
  };
}

function inTransaction<T>(db: Db | DbOrTrx, run: (trx: DbOrTrx) => Promise<T>): Promise<T> {
  return db.isTransaction ? run(db) : db.transaction().execute(run);
}

/**
 * Creates a listing, or updates the one with `listingId`, in one transaction.
 *
 * If the intent is "draft", the listing is saved as a draft. Only a new listing or a draft can be.
 * If the intent is "publish", the listing becomes active in this app. Nothing is posted to a marketplace.
 * Publishing an ended listing relists it, and its days listed start again.
 *
 * Marketplace rows are matched to the picked marketplaces rather than replaced, so `listed_at` survives an edit.
 * If a marketplace is unpicked on a listing that has been live, its row is marked ended. On a draft the row is deleted.
 *
 * Throws a DomainError if the listing is missing or sold, an item or marketplace is not the user's,
 * or the quantity is below the units already sold.
 */
export async function saveListing(
  db: Db | DbOrTrx,
  userId: string,
  input: ListingFormInput,
  listingId?: string,
): Promise<{ id: string; status: "draft" | "active" }> {
  return inTransaction(db, async (trx) => {
    const now = new Date();
    const existing = listingId
      ? await trx
          .selectFrom("listing")
          .select(["id", "status", "listed_at"])
          .where("id", "=", listingId)
          .where("user_id", "=", userId)
          .forUpdate()
          .executeTakeFirst()
      : null;
    if (listingId && !existing) throw new DomainError("not_found", "That listing does not exist.");
    if (existing?.status === "sold") throw new DomainError("invalid", "A sold listing cannot be edited.");
    const wasLive = existing !== null && existing !== undefined && existing.status !== "draft";
    if (input.intent === "draft" && wasLive) {
      throw new DomainError("invalid", "A listing that has been published cannot go back to a draft.");
    }
    const status = input.intent === "draft" ? "draft" : "active";

    const itemIds = input.items.map((item) => item.itemId);
    if (itemIds.length > 0) {
      const owned = await trx
        .selectFrom("inventory_item")
        .select("id")
        .where("user_id", "=", userId)
        .where("id", "in", itemIds)
        .execute();
      if (owned.length !== itemIds.length) throw new DomainError("invalid", "An item in this listing no longer exists.");
    }
    const marketplaceIds = input.marketplaces.map((row) => row.marketplaceId);
    if (marketplaceIds.length > 0) {
      const owned = await trx
        .selectFrom("marketplace")
        .select("id")
        .where("user_id", "=", userId)
        .where("id", "in", marketplaceIds)
        .execute();
      if (owned.length !== marketplaceIds.length) {
        throw new DomainError("invalid", "A picked marketplace no longer exists.");
      }
    }

    const fields = {
      title: input.title,
      asking_price_cents: input.askingPriceCents,
      quantity: input.quantity,
      shipping_charged_cents: input.shippingChargedCents,
      est_shipping_cost_cents: input.estShippingCostCents,
      commission_bps: input.commissionBps,
      commission_payee: input.commissionPayee,
      status,
      updated_at: now,
    } as const;

    let id: string;
    if (existing) {
      id = existing.id;
      const sold = (await loadListingSoldQuantities(trx, userId, [id])).get(id) ?? 0;
      if (input.quantity < sold) {
        throw new DomainError(
          "invalid",
          sold === 1
            ? "1 unit of this listing has already sold, so the quantity cannot be lower than 1."
            : `${sold} units of this listing have already sold, so the quantity cannot be lower than ${sold}.`,
        );
      }
      if (input.quantity === sold && sold > 0 && status === "active") {
        throw new DomainError("invalid", "Every unit of this listing has sold. Raise the quantity to keep it active.");
      }
      const becomesLive = status === "active" && existing.status !== "active";
      await trx
        .updateTable("listing")
        .set({
          ...fields,
          ...(becomesLive ? { listed_at: now, ended_at: null } : {}),
        })
        .where("id", "=", id)
        .where("user_id", "=", userId)
        .execute();
    } else {
      const inserted = await trx
        .insertInto("listing")
        .values({ ...fields, user_id: userId, listed_at: status === "active" ? now : null })
        .returning("id")
        .executeTakeFirstOrThrow();
      id = inserted.id;
    }

    const currentItems = await trx
      .selectFrom("listing_item")
      .select(["id", "item_id"])
      .where("listing_id", "=", id)
      .where("user_id", "=", userId)
      .execute();
    const removedItemRowIds = currentItems.filter((row) => !itemIds.includes(row.item_id)).map((row) => row.id);
    if (removedItemRowIds.length > 0) {
      await trx.deleteFrom("listing_item").where("id", "in", removedItemRowIds).where("user_id", "=", userId).execute();
    }
    const currentItemIds = new Set(currentItems.map((row) => row.item_id));
    for (const [position, item] of input.items.entries()) {
      if (currentItemIds.has(item.itemId)) {
        await trx
          .updateTable("listing_item")
          .set({ quantity_per_unit: item.quantityPerUnit, position })
          .where("listing_id", "=", id)
          .where("item_id", "=", item.itemId)
          .where("user_id", "=", userId)
          .execute();
      } else {
        await trx
          .insertInto("listing_item")
          .values({ user_id: userId, listing_id: id, item_id: item.itemId, quantity_per_unit: item.quantityPerUnit, position })
          .execute();
      }
    }

    const currentRows = await trx
      .selectFrom("listing_marketplace")
      .select(["id", "marketplace_id", "status", "listed_at"])
      .where("listing_id", "=", id)
      .where("user_id", "=", userId)
      .execute();
    const currentByMarketplace = new Map(currentRows.map((row) => [row.marketplace_id, row]));
    for (const row of currentRows) {
      if (marketplaceIds.includes(row.marketplace_id)) continue;
      if (!wasLive) {
        await trx.deleteFrom("listing_marketplace").where("id", "=", row.id).where("user_id", "=", userId).execute();
      } else if (row.status === "active") {
        await trx
          .updateTable("listing_marketplace")
          .set({ status: "ended", ended_at: now })
          .where("id", "=", row.id)
          .where("user_id", "=", userId)
          .execute();
      }
    }
    for (const picked of input.marketplaces) {
      const current = currentByMarketplace.get(picked.marketplaceId);
      const shared = { external_url: picked.externalUrl, asking_price_cents: picked.askingPriceCents };
      if (current) {
        const goesUpNow = status === "active" && (current.status === "ended" || current.listed_at === null);
        await trx
          .updateTable("listing_marketplace")
          .set({
            ...shared,
            status: "active",
            ended_at: null,
            ...(goesUpNow ? { listed_at: now } : {}),
          })
          .where("id", "=", current.id)
          .where("user_id", "=", userId)
          .execute();
      } else {
        await trx
          .insertInto("listing_marketplace")
          .values({
            ...shared,
            user_id: userId,
            listing_id: id,
            marketplace_id: picked.marketplaceId,
            listed_at: status === "active" ? now : null,
          })
          .execute();
      }
    }

    return { id, status };
  });
}

/**
 * Ends a listing everywhere.
 * If the listing is active, it becomes ended and every marketplace row is marked ended.
 * If the listing is sold, it stays sold and the rows still marked active are ended. That clears "sold, still up elsewhere".
 * Throws a DomainError for a draft or an already ended listing.
 */
export async function endListing(db: Db | DbOrTrx, userId: string, listingId: string): Promise<void> {
  await inTransaction(db, async (trx) => {
    const listing = await trx
      .selectFrom("listing")
      .select(["id", "status"])
      .where("id", "=", listingId)
      .where("user_id", "=", userId)
      .forUpdate()
      .executeTakeFirst();
    if (!listing) throw new DomainError("not_found", "That listing does not exist.");
    if (listing.status !== "active" && listing.status !== "sold") {
      throw new DomainError("invalid", "Only an active or sold listing can be ended.");
    }
    const now = new Date();
    if (listing.status === "active") {
      await trx
        .updateTable("listing")
        .set({ status: "ended", ended_at: now, updated_at: now })
        .where("id", "=", listing.id)
        .where("user_id", "=", userId)
        .execute();
    }
    await trx
      .updateTable("listing_marketplace")
      .set({ status: "ended", ended_at: now })
      .where("listing_id", "=", listing.id)
      .where("user_id", "=", userId)
      .where("status", "=", "active")
      .execute();
  });
}

/**
 * Takes a listing down from one marketplace while it stays up on the others.
 * It works on an active listing and on a sold one that is still up somewhere.
 * If that was the last marketplace an active listing was up on, the listing itself becomes ended.
 */
export async function endListingMarketplace(
  db: Db | DbOrTrx,
  userId: string,
  listingId: string,
  marketplaceId: string,
): Promise<{ listingEnded: boolean }> {
  return inTransaction(db, async (trx) => {
    const listing = await trx
      .selectFrom("listing")
      .select(["id", "status"])
      .where("id", "=", listingId)
      .where("user_id", "=", userId)
      .forUpdate()
      .executeTakeFirst();
    if (!listing) throw new DomainError("not_found", "That listing does not exist.");
    if (listing.status !== "active" && listing.status !== "sold") {
      throw new DomainError("invalid", "Only an active or sold listing can be taken down from a marketplace.");
    }
    const now = new Date();
    const ended = await trx
      .updateTable("listing_marketplace")
      .set({ status: "ended", ended_at: now })
      .where("listing_id", "=", listing.id)
      .where("marketplace_id", "=", marketplaceId)
      .where("user_id", "=", userId)
      .where("status", "=", "active")
      .returning("id")
      .execute();
    if (ended.length === 0) throw new DomainError("not_on_marketplace", "This listing is not up on that marketplace.");

    if (listing.status !== "active") return { listingEnded: false };
    const stillUp = await trx
      .selectFrom("listing_marketplace")
      .select("id")
      .where("listing_id", "=", listing.id)
      .where("user_id", "=", userId)
      .where("status", "=", "active")
      .limit(1)
      .executeTakeFirst();
    if (stillUp) return { listingEnded: false };
    await trx
      .updateTable("listing")
      .set({ status: "ended", ended_at: now, updated_at: now })
      .where("id", "=", listing.id)
      .where("user_id", "=", userId)
      .execute();
    return { listingEnded: true };
  });
}

/** Deletes a draft. Throws a DomainError for anything that has been published, because sales and history hang off it. */
export async function deleteDraftListing(db: Db | DbOrTrx, userId: string, listingId: string): Promise<void> {
  await inTransaction(db, async (trx) => {
    const listing = await trx
      .selectFrom("listing")
      .select(["id", "status"])
      .where("id", "=", listingId)
      .where("user_id", "=", userId)
      .forUpdate()
      .executeTakeFirst();
    if (!listing) throw new DomainError("not_found", "That listing does not exist.");
    if (listing.status !== "draft") throw new DomainError("invalid", "Only a draft can be deleted. End the listing instead.");
    // listing_item and listing_marketplace rows go with it (ON DELETE CASCADE).
    await trx.deleteFrom("listing").where("id", "=", listing.id).where("user_id", "=", userId).execute();
  });
}

/**
 * Adds a marketplace from the listing form.
 * If one with the same name already exists (ignoring case), that one is returned.
 * If the existing one was archived, it is brought back.
 */
export async function createMarketplace(db: Db | DbOrTrx, userId: string, name: string): Promise<MarketplaceOption> {
  const trimmed = name.trim();
  if (trimmed === "") throw new DomainError("invalid", "Enter a name for the marketplace.");
  return inTransaction(db, async (trx) => {
    const existing = await trx
      .selectFrom("marketplace")
      .select(["id", "name", "archived_at"])
      .where("user_id", "=", userId)
      .where((eb) => eb(eb.fn<string>("lower", ["name"]), "=", trimmed.toLowerCase()))
      .executeTakeFirst();
    if (existing) {
      if (existing.archived_at !== null) {
        await trx
          .updateTable("marketplace")
          .set({ archived_at: null })
          .where("id", "=", existing.id)
          .where("user_id", "=", userId)
          .execute();
      }
      return { id: existing.id, name: existing.name };
    }
    return trx
      .insertInto("marketplace")
      .values({ user_id: userId, name: trimmed })
      .returning(["id", "name"])
      .executeTakeFirstOrThrow();
  });
}
