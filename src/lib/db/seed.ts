import type { DbOrTrx } from "./index";

export const SEED_CATEGORIES: readonly { name: string; children: readonly string[] }[] = [
  { name: "Book", children: [] },
  { name: "Movie", children: ["DVD", "Blu-ray", "VHS"] },
  { name: "Clothing", children: [] },
];

export const SEED_MARKETPLACES: readonly string[] = ["eBay", "Mercari", "Facebook Marketplace", "Vinted"];

/** Creates the user row for an email if it is missing. Returns the user id either way. */
export async function ensureUser(db: DbOrTrx, email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  await db
    .insertInto("app_user")
    .values({ email: normalized })
    .onConflict((oc) => oc.column("email").doNothing())
    .execute();
  const user = await db
    .selectFrom("app_user")
    .select("id")
    .where("email", "=", normalized)
    .executeTakeFirstOrThrow();
  return user.id;
}

async function ensureCategory(db: DbOrTrx, userId: string, parentId: string | null, name: string): Promise<string> {
  const existing = await db
    .selectFrom("category")
    .select("id")
    .where("user_id", "=", userId)
    .where("parent_id", parentId === null ? "is" : "=", parentId)
    .where((eb) => eb(eb.fn("lower", ["name"]), "=", name.toLowerCase()))
    .executeTakeFirst();
  if (existing) return existing.id;
  const created = await db
    .insertInto("category")
    .values({ user_id: userId, parent_id: parentId, name })
    .returning("id")
    .executeTakeFirstOrThrow();
  return created.id;
}

/**
 * Seeds what a new owner needs: the user row, a settings row, the starter categories and the starter marketplaces.
 * It ships no fee rates. Running it again changes nothing, and it never undoes a rename or an archive.
 * A starter category or marketplace is only created the first time, when the user has none at all.
 * Returns the user id.
 */
export async function seedBase(db: DbOrTrx, ownerEmail: string): Promise<string> {
  const userId = await ensureUser(db, ownerEmail);

  await db
    .insertInto("user_settings")
    .values({ user_id: userId })
    .onConflict((oc) => oc.column("user_id").doNothing())
    .execute();

  const hasCategories = await db
    .selectFrom("category")
    .select("id")
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  if (!hasCategories) {
    for (const category of SEED_CATEGORIES) {
      const parentId = await ensureCategory(db, userId, null, category.name);
      for (const child of category.children) await ensureCategory(db, userId, parentId, child);
    }
  }

  const hasMarketplaces = await db
    .selectFrom("marketplace")
    .select("id")
    .where("user_id", "=", userId)
    .limit(1)
    .executeTakeFirst();
  if (!hasMarketplaces) {
    await db
      .insertInto("marketplace")
      .values(SEED_MARKETPLACES.map((name) => ({ user_id: userId, name })))
      .execute();
  }

  return userId;
}
