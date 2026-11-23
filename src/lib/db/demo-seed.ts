import { addDays, todayIsoDate } from "@/lib/format";
import { recordSale } from "@/lib/domain/sales";
import type { Db } from "./index";
import { seedBase } from "./seed";

/** A small seeded random generator, so the demo data is the same on every run. */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface DemoItem {
  title: string;
  category: string;
  /** Typical cost in cents. */
  cost: number;
  /** Typical asking price in cents. */
  price: number;
  identifier?: { type: "upc" | "isbn13"; value: string };
}

const DEMO_ITEMS: readonly DemoItem[] = [
  { title: "Dune, hardcover", category: "Book", cost: 200, price: 1800, identifier: { type: "isbn13", value: "9780441013593" } },
  { title: "Sapiens, paperback", category: "Book", cost: 150, price: 1100, identifier: { type: "isbn13", value: "9780062316110" } },
  { title: "The Hobbit, illustrated edition", category: "Book", cost: 300, price: 2200 },
  { title: "Salt, Fat, Acid, Heat", category: "Book", cost: 400, price: 1900 },
  { title: "Educated, hardcover", category: "Book", cost: 100, price: 900 },
  { title: "The Art of Electronics, 3rd edition", category: "Book", cost: 1200, price: 6500 },
  { title: "Calvin and Hobbes box set", category: "Book", cost: 2500, price: 8900 },
  { title: "Where the Crawdads Sing", category: "Book", cost: 100, price: 800 },
  { title: "Project Hail Mary, hardcover", category: "Book", cost: 250, price: 1400 },
  { title: "The Joy of Cooking, 1975", category: "Book", cost: 300, price: 2400 },
  { title: "Atomic Habits", category: "Book", cost: 200, price: 1200 },
  { title: "Ansel Adams: 400 Photographs", category: "Book", cost: 500, price: 2800 },
  { title: "The Matrix", category: "DVD", cost: 75, price: 600, identifier: { type: "upc", value: "085391737322" } },
  { title: "Spirited Away", category: "DVD", cost: 100, price: 1200 },
  { title: "The Office, complete series", category: "DVD", cost: 800, price: 3800 },
  { title: "Pulp Fiction, collector's edition", category: "DVD", cost: 100, price: 900 },
  { title: "Planet Earth, box set", category: "DVD", cost: 300, price: 1600 },
  { title: "Twin Peaks, season one", category: "DVD", cost: 250, price: 1500 },
  { title: "The Princess Bride", category: "DVD", cost: 75, price: 700 },
  { title: "The Fellowship of the Ring, Extended Edition", category: "Blu-ray", cost: 300, price: 1800 },
  { title: "Blade Runner: The Final Cut", category: "Blu-ray", cost: 200, price: 1400 },
  { title: "Mad Max: Fury Road", category: "Blu-ray", cost: 150, price: 1000 },
  { title: "Seven Samurai, Criterion", category: "Blu-ray", cost: 600, price: 2600 },
  { title: "Interstellar", category: "Blu-ray", cost: 150, price: 1100 },
  { title: "Jurassic Park", category: "VHS", cost: 100, price: 1200 },
  { title: "Star Wars trilogy, 1995 release", category: "VHS", cost: 400, price: 3200 },
  { title: "The Lion King, black diamond", category: "VHS", cost: 100, price: 1500 },
  { title: "Ghostbusters", category: "VHS", cost: 50, price: 800 },
  { title: "Levi's 501 jeans, 32×32", category: "Clothing", cost: 650, price: 2800 },
  { title: "Levi's 501 jeans, 32×30", category: "Clothing", cost: 650, price: 2800 },
  { title: "Patagonia Better Sweater, medium", category: "Clothing", cost: 1200, price: 4800 },
  { title: "Pendleton wool shirt, large", category: "Clothing", cost: 800, price: 3600 },
  { title: "Carhartt chore coat, large", category: "Clothing", cost: 1500, price: 6200 },
  { title: "Vintage Nike windbreaker, medium", category: "Clothing", cost: 500, price: 3400 },
  { title: "Dr. Martens 1460 boots, size 9", category: "Clothing", cost: 1800, price: 7000 },
  { title: "L.L.Bean flannel, medium", category: "Clothing", cost: 400, price: 2200 },
  { title: "Wool blanket, twin", category: "Clothing", cost: 400, price: 1500 },
  { title: "Champion reverse weave hoodie, large", category: "Clothing", cost: 700, price: 3200 },
  { title: "The Legend of Zelda: Ocarina of Time", category: "N64", cost: 1400, price: 3999 },
  { title: "N64 Expansion Pak", category: "N64", cost: 400, price: 1800 },
  { title: "Super Mario 64", category: "N64", cost: 1200, price: 3999 },
  { title: "Mario Kart 64", category: "N64", cost: 1500, price: 4500 },
  { title: "GoldenEye 007", category: "N64", cost: 800, price: 2400 },
  { title: "Pokémon Snap", category: "N64", cost: 600, price: 2200 },
];

const SOURCES = ["Goodwill", "Estate sale", "Library sale", "Garage sale", "Flea market", "Thrift store"] as const;
const BINS = ["Shelf A1", "Shelf A2", "Shelf B1", "Bin 3", "Bin 7", "Closet rack", null] as const;

export interface DemoSeedSummary {
  userId: string;
  items: number;
  listings: number;
  sales: number;
}

/**
 * Fills the database with a realistic spread of data for screens and charts: items, purchases, fee rules,
 * listings on several marketplaces, and sales across the last six months.
 * All dates are counted back from today, so the dashboard always has a current month.
 * It refuses to run if the user already has inventory. Run `pnpm db:reset` first.
 */
export async function seedDemo(db: Db, ownerEmail: string): Promise<DemoSeedSummary> {
  const userId = await seedBase(db, ownerEmail);
  const existing = await db
    .selectFrom("inventory_item")
    .select("id")
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  if (existing) {
    throw new Error("Demo data needs an empty inventory. Run `pnpm db:reset` first.");
  }

  const random = mulberry32(20261123);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const pick = <T>(values: readonly T[]): T => {
    const value = values[Math.floor(random() * values.length)];
    if (value === undefined) throw new Error("pick() needs a non-empty list");
    return value;
  };
  const today = todayIsoDate();
  const daysAgo = (days: number) => addDays(today, -days);
  const timestampDaysAgo = (days: number) => new Date(`${daysAgo(days)}T15:00:00Z`);

  const games = await db
    .insertInto("category")
    .values({ user_id: userId, parent_id: null, name: "Games" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db.insertInto("category").values({ user_id: userId, parent_id: games.id, name: "N64" }).execute();

  const categoryRows = await db.selectFrom("category").select(["id", "name"]).where("user_id", "=", userId).execute();
  const categoryId = (name: string) => {
    const found = categoryRows.find((row) => row.name === name);
    if (!found) throw new Error(`Missing category ${name}`);
    return found.id;
  };
  const marketplaceRows = await db.selectFrom("marketplace").select(["id", "name"]).where("user_id", "=", userId).execute();
  const marketplaceId = (name: string) => {
    const found = marketplaceRows.find((row) => row.name === name);
    if (!found) throw new Error(`Missing marketplace ${name}`);
    return found.id;
  };
  const ebay = marketplaceId("eBay");
  const mercari = marketplaceId("Mercari");
  const facebook = marketplaceId("Facebook Marketplace");
  const vinted = marketplaceId("Vinted");

  await db
    .insertInto("fee_rule")
    .values([
      { user_id: userId, marketplace_id: ebay, category_id: null, percent_bps: 1300, fixed_cents: 40 },
      { user_id: userId, marketplace_id: ebay, category_id: categoryId("Book"), percent_bps: 1495, fixed_cents: 40 },
      { user_id: userId, marketplace_id: mercari, category_id: null, percent_bps: 1000, fixed_cents: 50 },
      {
        user_id: userId,
        marketplace_id: vinted,
        category_id: null,
        percent_bps: 0,
        applies_to_shipping: false,
        fixed_cents: 0,
      },
    ])
    .execute();
  await db
    .updateTable("user_settings")
    .set({ default_commission_bps: 2000, default_commission_payee: "Sam" })
    .where("user_id", "=", userId)
    .execute();

  const marketplacesFor = (category: string): string[] => {
    const roll = random();
    if (category === "Clothing") return roll < 0.5 ? [vinted, ebay] : roll < 0.8 ? [vinted] : [vinted, mercari, facebook];
    if (category === "Book") return roll < 0.6 ? [ebay] : [ebay, mercari];
    if (category === "N64") return roll < 0.7 ? [ebay, mercari] : [ebay];
    return roll < 0.4 ? [ebay] : roll < 0.8 ? [mercari, ebay] : [facebook, mercari];
  };

  let listings = 0;
  let sales = 0;
  const itemIds = new Map<string, string>();

  for (const [index, item] of DEMO_ITEMS.entries()) {
    const boughtDaysAgo = between(4, 175);
    const firstQuantity = random() < 0.25 ? between(2, 4) : 1;
    const restock = random() < 0.2 && boughtDaysAgo > 30;
    const restockQuantity = restock ? between(1, 3) : 0;
    const created = await db
      .insertInto("inventory_item")
      .values({
        user_id: userId,
        title: item.title,
        category_id: categoryId(item.category),
        condition: pick(["Very good", "Good", "Like new", "Acceptable", null]),
        quantity_on_hand: firstQuantity + restockQuantity,
        storage_location: pick(BINS),
        created_at: timestampDaysAgo(boughtDaysAgo),
        updated_at: timestampDaysAgo(boughtDaysAgo),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    itemIds.set(item.title, created.id);

    await db
      .insertInto("purchase")
      .values({
        user_id: userId,
        item_id: created.id,
        purchased_at: daysAgo(boughtDaysAgo),
        quantity: firstQuantity,
        unit_cost_cents: item.cost,
        source: pick(SOURCES),
      })
      .execute();
    if (restock) {
      await db
        .insertInto("purchase")
        .values({
          user_id: userId,
          item_id: created.id,
          purchased_at: daysAgo(between(2, boughtDaysAgo - 10)),
          quantity: restockQuantity,
          unit_cost_cents: item.cost + between(-50, 150),
          source: pick(SOURCES),
        })
        .execute();
    }
    if (item.identifier) {
      await db
        .insertInto("item_identifier")
        .values({ user_id: userId, item_id: created.id, type: item.identifier.type, value: item.identifier.value })
        .execute();
    }

    // The Expansion Pak is only sold in the Zelda bundle below. Every fifth item stays unlisted.
    if (item.title === "N64 Expansion Pak" || item.title.startsWith("The Legend of Zelda") || index % 5 === 4) continue;

    const listedDaysAgo = Math.max(1, boughtDaysAgo - between(1, 6));
    const quantity = firstQuantity + restockQuantity;
    const marketplaces = marketplacesFor(item.category);
    const hasCommission = random() < 0.3;
    // A few listings are priced under their minimum on purpose, for the needs-attention list.
    const underpriced = index % 13 === 6;
    const shippingCharged = item.category === "Clothing" ? 0 : pick([0, 399, 500]);
    const estShippingCost = pick([450, 560, 620, 0]);
    const listing = await db
      .insertInto("listing")
      .values({
        user_id: userId,
        title: item.title,
        status: "active",
        asking_price_cents: underpriced ? Math.max(100, item.cost - 50) : item.price,
        quantity,
        shipping_charged_cents: shippingCharged,
        est_shipping_cost_cents: estShippingCost,
        commission_bps: hasCommission ? 2000 : null,
        commission_payee: hasCommission ? "Sam" : null,
        listed_at: timestampDaysAgo(listedDaysAgo),
        created_at: timestampDaysAgo(listedDaysAgo),
        updated_at: timestampDaysAgo(listedDaysAgo),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    listings += 1;
    await db
      .insertInto("listing_item")
      .values({ user_id: userId, listing_id: listing.id, item_id: created.id, quantity_per_unit: 1 })
      .execute();
    await db
      .insertInto("listing_marketplace")
      .values(
        marketplaces.map((id, position) => ({
          user_id: userId,
          listing_id: listing.id,
          marketplace_id: id,
          listed_at: timestampDaysAgo(listedDaysAgo),
          external_url: position === 0 && random() < 0.5 ? `https://example.com/listing/${index + 1000}` : null,
        })),
      )
      .execute();

    if (underpriced || listedDaysAgo < 3 || random() < 0.3) continue;

    const unitsToSell = quantity > 1 && random() < 0.5 ? between(1, quantity - 1) : quantity;
    let soldDaysAgo = listedDaysAgo;
    for (let unit = 0; unit < unitsToSell; unit += 1) {
      soldDaysAgo = Math.max(0, soldDaysAgo - between(2, 28));
      const soldOn = pick(marketplaces);
      const discount = pick([0, 0, 0, 100, 200, 300]);
      const recorded = await recordSale(db, userId, {
        listingId: listing.id,
        marketplaceId: soldOn,
        soldAt: daysAgo(soldDaysAgo),
        quantity: 1,
        salePriceCents: Math.max(100, item.price - discount),
        shippingCostCents: estShippingCost === 0 ? 0 : estShippingCost + between(-40, 90),
        additionalFeesCents: random() < 0.15 ? between(50, 250) : 0,
      });
      sales += 1;
      if (recorded.breakdown.commissionCents > 0 && soldDaysAgo > 30) {
        await db
          .updateTable("sale")
          .set({ commission_paid_at: daysAgo(soldDaysAgo - between(3, 14)) })
          .where("id", "=", recorded.saleId)
          .execute();
      }
      if (recorded.listingSoldOut) {
        const endedAt = timestampDaysAgo(soldDaysAgo);
        await db.updateTable("listing").set({ ended_at: endedAt, updated_at: endedAt }).where("id", "=", listing.id).execute();
        await db
          .updateTable("listing_marketplace")
          .set({ ended_at: endedAt })
          .where("listing_id", "=", listing.id)
          .where("status", "=", "ended")
          .execute();
        // Most sold listings were taken down everywhere. The rest stay up, for the "still up elsewhere" flag.
        if (random() < 0.8) {
          await db
            .updateTable("listing_marketplace")
            .set({ status: "ended", ended_at: endedAt })
            .where("listing_id", "=", listing.id)
            .where("status", "=", "active")
            .execute();
        }
      }
      if (soldDaysAgo === 0) break;
    }
  }

  const zelda = itemIds.get("The Legend of Zelda: Ocarina of Time");
  const pak = itemIds.get("N64 Expansion Pak");
  if (zelda && pak) {
    const bundle = await db
      .insertInto("listing")
      .values({
        user_id: userId,
        title: "Zelda Ocarina of Time N64 with Expansion Pak, tested",
        status: "active",
        asking_price_cents: 4499,
        quantity: 1,
        shipping_charged_cents: 500,
        est_shipping_cost_cents: 560,
        commission_bps: 2000,
        commission_payee: "Sam",
        listed_at: timestampDaysAgo(9),
        created_at: timestampDaysAgo(9),
        updated_at: timestampDaysAgo(9),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    listings += 1;
    await db
      .insertInto("listing_item")
      .values([
        { user_id: userId, listing_id: bundle.id, item_id: zelda, quantity_per_unit: 1, position: 0 },
        { user_id: userId, listing_id: bundle.id, item_id: pak, quantity_per_unit: 1, position: 1 },
      ])
      .execute();
    await db
      .insertInto("listing_marketplace")
      .values([
        { user_id: userId, listing_id: bundle.id, marketplace_id: ebay, listed_at: timestampDaysAgo(9) },
        { user_id: userId, listing_id: bundle.id, marketplace_id: mercari, listed_at: timestampDaysAgo(9) },
      ])
      .execute();
  }

  const draftItem = itemIds.get("Atomic Habits");
  if (draftItem) {
    const draft = await db
      .insertInto("listing")
      .values({ user_id: userId, title: "Atomic Habits (draft)", status: "draft", asking_price_cents: 1200 })
      .returning("id")
      .executeTakeFirstOrThrow();
    listings += 1;
    await db
      .insertInto("listing_item")
      .values({ user_id: userId, listing_id: draft.id, item_id: draftItem, quantity_per_unit: 1 })
      .execute();
  }

  return { userId, items: DEMO_ITEMS.length, listings, sales };
}
