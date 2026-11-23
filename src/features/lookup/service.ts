import type { Db } from "@/lib/db";
import { readCachedSearch, writeCachedSearch } from "./cache";
import { normalizeQuery } from "./query";
import { PriceSourceError, type PriceSource, type SourceOutcome } from "./types";

export interface LookupOptions {
  /** Only these source ids are searched. Leave it out to search every source. */
  only?: readonly string[];
  now?: Date;
}

/**
 * Searches that are still running, by user, source and normalized query.
 * If the same search is asked for again before the first one finishes, both share one call to the source.
 * React runs effects twice in development, and without this each eBay search would use two requests of a small monthly allowance.
 */
const inFlight = new Map<string, Promise<SourceOutcome>>();

/**
 * Looks one query up in one source: the cache first, then the source itself.
 * It never throws. A failure comes back as an outcome with status "error", so one source cannot blank the others.
 * Failures are not cached, so the next search tries again.
 */
export function lookupInSource(
  db: Db,
  userId: string,
  source: PriceSource,
  query: string,
  now: Date = new Date(),
): Promise<SourceOutcome> {
  const key = JSON.stringify([userId, source.id, normalizeQuery(query)]);
  const running = inFlight.get(key);
  if (running) return running;
  const started = runLookup(db, userId, source, query, now).finally(() => inFlight.delete(key));
  inFlight.set(key, started);
  return started;
}

async function runLookup(db: Db, userId: string, source: PriceSource, query: string, now: Date): Promise<SourceOutcome> {
  const base = { source: source.id, label: source.label };
  if (!source.isConfigured()) return { ...base, status: "not_configured", message: source.setupHint };
  const normalizedQuery = normalizeQuery(query);
  try {
    const cached = await readCachedSearch(db, userId, source.id, normalizedQuery, now);
    if (cached) {
      return { ...base, status: "ok", cached: true, fetchedAt: cached.fetchedAt.toISOString(), data: cached.data };
    }
    const data = await source.search(query);
    await writeCachedSearch(db, userId, source.id, normalizedQuery, data, now);
    return { ...base, status: "ok", cached: false, fetchedAt: now.toISOString(), data };
  } catch (error) {
    if (error instanceof PriceSourceError) {
      if (error.code === "not_configured") return { ...base, status: "not_configured", message: error.message };
      return { ...base, status: "error", code: error.code, message: error.message };
    }
    // Only the error's name and message are logged. Request headers hold the API key and must stay out of the logs.
    console.error(`Price lookup failed for source ${source.id}:`, error instanceof Error ? `${error.name}: ${error.message}` : "unknown error");
    return { ...base, status: "error", code: "unavailable", message: `${source.label} could not be searched just now.` };
  }
}

/** Looks a query up in every source at once. The outcomes come back in the order of `sources`. */
export async function lookupPrices(
  db: Db,
  userId: string,
  sources: readonly PriceSource[],
  query: string,
  options: LookupOptions = {},
): Promise<SourceOutcome[]> {
  const chosen = options.only ? sources.filter((source) => options.only?.includes(source.id)) : sources;
  return Promise.all(chosen.map((source) => lookupInSource(db, userId, source, query, options.now)));
}
