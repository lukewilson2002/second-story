import type { Db } from "@/lib/db";
import { listingFormSchema, type ListingFormInput } from "./schemas";

/** Builders for the listings and sales tests. For vitest only. */

export async function categoryIdByName(db: Db, userId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom("category")
    .select("id")
    .where("user_id", "=", userId)
    .where("name", "=", name)
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function marketplaceIdByName(db: Db, userId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom("marketplace")
    .select("id")
    .where("user_id", "=", userId)
    .where("name", "=", name)
    .executeTakeFirstOrThrow();
  return row.id;
}

export async function addItem(
  db: Db,
  userId: string,
  item: { title: string; categoryId: string; quantity: number; unitCostCents: number },
): Promise<string> {
  const created = await db
    .insertInto("inventory_item")
    .values({ user_id: userId, title: item.title, category_id: item.categoryId, quantity_on_hand: item.quantity })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("purchase")
    .values({
      user_id: userId,
      item_id: created.id,
      purchased_at: "2026-10-01",
      quantity: item.quantity,
      unit_cost_cents: item.unitCostCents,
    })
    .execute();
  return created.id;
}

export async function addFeeRule(
  db: Db,
  userId: string,
  rule: { marketplaceId: string; percentBps: number; fixedCents: number },
): Promise<void> {
  await db
    .insertInto("fee_rule")
    .values({
      user_id: userId,
      marketplace_id: rule.marketplaceId,
      category_id: null,
      percent_bps: rule.percentBps,
      fixed_cents: rule.fixedCents,
      applies_to_shipping: true,
    })
    .execute();
}

/** Builds a parsed listing form the way the browser would post it, so tests go through the real schema. */
export function listingInput(input: {
  intent?: "draft" | "publish";
  title?: string;
  askingPrice?: string;
  quantity?: number;
  shippingCharged?: string;
  estShippingCost?: string;
  commissionPercent?: string;
  commissionPayee?: string;
  items: { itemId: string; quantityPerUnit?: number }[];
  marketplaces: { marketplaceId: string; url?: string; price?: string }[];
}): ListingFormInput {
  return listingFormSchema.parse({
    intent: input.intent ?? "publish",
    title: input.title ?? "Test listing",
    askingPrice: input.askingPrice ?? "44.99",
    quantity: String(input.quantity ?? 1),
    shippingCharged: input.shippingCharged ?? "",
    estShippingCost: input.estShippingCost ?? "",
    commissionPercent: input.commissionPercent ?? "",
    commissionPayee: input.commissionPayee ?? "",
    items: JSON.stringify(input.items.map((item) => ({ itemId: item.itemId, quantityPerUnit: item.quantityPerUnit ?? 1 }))),
    marketplaces: JSON.stringify(
      input.marketplaces.map((row) => ({ marketplaceId: row.marketplaceId, url: row.url ?? "", price: row.price ?? "" })),
    ),
  });
}
