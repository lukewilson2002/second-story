import { z } from "zod";
import { identifierTypeSchema } from "@/lib/schemas";

/**
 * The shapes every price source returns, shared by the server and the lookup page.
 * They are Zod schemas because the same payload is stored in price_lookup_cache and read back as untyped JSON.
 */

/** One price on a result or in a summary, for example Loose $25.23. Null means the source has no price for it. */
export const pricePointSchema = z.object({
  /** Stable name for the price, for example "loose", "complete", "new", "sold", "shipping", "median". */
  key: z.string(),
  /** What the source calls it on screen. */
  label: z.string(),
  cents: z.number().int().nonnegative().nullable(),
});
export type PricePoint = z.infer<typeof pricePointSchema>;

export const priceResultSchema = z.object({
  /** Unique within one source's results. */
  id: z.string(),
  source: z.string(),
  title: z.string(),
  /** The title to prefill when the result starts "Add item". For a game it includes the platform. */
  itemTitle: z.string(),
  /** A clean product name worth searching the other sources for, or null if the title is a seller's own wording. */
  searchText: z.string().nullable(),
  /** The platform for a game, or condition and sale details for a sold listing. */
  subtitle: z.string().nullable(),
  prices: z.array(pricePointSchema),
  url: z.string().nullable(),
  imageUrl: z.string().nullable(),
  /** A product code the source itself reports for this result. Already normalized. */
  identifier: z.object({ type: identifierTypeSchema, value: z.string() }).nullable(),
});
export type PriceResult = z.infer<typeof priceResultSchema>;

/** How much of the source's request allowance is left, as reported with the response. */
export const sourceQuotaSchema = z.object({
  limit: z.number().int().nullable(),
  remaining: z.number().int().nullable(),
  /** ISO timestamp of when the allowance resets. */
  resetsAt: z.string().nullable(),
});
export type SourceQuota = z.infer<typeof sourceQuotaSchema>;

export const sourceSearchSchema = z.object({
  results: z.array(priceResultSchema),
  /** Prices across all results, for example the median sold price. Empty if the source has none. */
  summary: z.array(pricePointSchema),
  /** The same search on the source's own site, if there is one. */
  searchUrl: z.string().nullable(),
  /** A short note from the source to show above the results. */
  notice: z.string().nullable(),
  quota: sourceQuotaSchema.nullable(),
});
export type SourceSearch = z.infer<typeof sourceSearchSchema>;

/**
 * One place prices come from. Add a source by implementing this and listing it in `sources/index.ts`.
 * `search` throws a PriceSourceError for anything the owner can understand or fix.
 */
export interface PriceSource {
  /** Stored in price_lookup_cache.source. Do not change it once released. */
  readonly id: string;
  readonly label: string;
  /** The site's own name, for links such as "View on eBay". */
  readonly siteName: string;
  /** One line under the heading, saying what the prices are. */
  readonly description: string;
  /** False if the source needs a key that is not set. A source that is not configured is never called. */
  isConfigured(): boolean;
  /** Shown instead of results if `isConfigured()` is false. */
  readonly setupHint: string;
  search(query: string): Promise<SourceSearch>;
}

export type PriceSourceErrorCode = "not_configured" | "refused" | "quota" | "unavailable" | "unexpected_response";

/** A failure the lookup page can explain. The message is shown to the owner, so it must never contain a key. */
export class PriceSourceError extends Error {
  readonly code: PriceSourceErrorCode;
  /** The HTTP status the source answered with, if it answered. */
  readonly status: number | null;

  constructor(code: PriceSourceErrorCode, message: string, status: number | null = null) {
    super(message);
    this.name = "PriceSourceError";
    this.code = code;
    this.status = status;
  }
}

/** What the lookup API returns for one source. One source failing does not affect the others. */
export type SourceOutcome =
  | {
      source: string;
      label: string;
      status: "ok";
      /** True if this came from price_lookup_cache instead of a fresh call. */
      cached: boolean;
      /** ISO timestamp of the call that produced the data. */
      fetchedAt: string;
      data: SourceSearch;
    }
  | { source: string; label: string; status: "not_configured"; message: string }
  | { source: string; label: string; status: "error"; code: PriceSourceErrorCode; message: string };

export interface LookupResponse {
  query: string;
  sources: SourceOutcome[];
}

/** What the page needs to draw a source's card before any result arrives. */
export interface SourceInfo {
  id: string;
  label: string;
  siteName: string;
  description: string;
  configured: boolean;
  setupHint: string;
}
