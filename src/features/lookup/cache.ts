import type { DbOrTrx } from "@/lib/db";
import { sourceSearchSchema, type SourceSearch } from "./types";

/** A cached answer older than this is ignored and fetched again. */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface CachedSearch {
  data: SourceSearch;
  fetchedAt: Date;
}

/**
 * Returns the cached answer for a source and normalized query, if it is less than 24 hours old.
 * If the stored payload no longer matches the current shape, it is treated as missing, so a shape change needs no cleanup.
 */
export async function readCachedSearch(
  db: DbOrTrx,
  userId: string,
  source: string,
  normalizedQuery: string,
  now: Date = new Date(),
): Promise<CachedSearch | null> {
  const row = await db
    .selectFrom("price_lookup_cache")
    .select(["payload", "fetched_at"])
    .where("user_id", "=", userId)
    .where("source", "=", source)
    .where("normalized_query", "=", normalizedQuery)
    .executeTakeFirst();
  if (!row) return null;
  if (now.getTime() - row.fetched_at.getTime() >= CACHE_TTL_MS) return null;
  const parsed = sourceSearchSchema.safeParse(row.payload);
  return parsed.success ? { data: parsed.data, fetchedAt: row.fetched_at } : null;
}

/** Stores an answer, replacing any earlier one for the same source and query. */
export async function writeCachedSearch(
  db: DbOrTrx,
  userId: string,
  source: string,
  normalizedQuery: string,
  data: SourceSearch,
  now: Date = new Date(),
): Promise<void> {
  const payload = JSON.stringify(data);
  await db
    .insertInto("price_lookup_cache")
    .values({ user_id: userId, source, normalized_query: normalizedQuery, payload, fetched_at: now })
    .onConflict((conflict) =>
      conflict.columns(["user_id", "source", "normalized_query"]).doUpdateSet({ payload, fetched_at: now }),
    )
    .execute();
}
