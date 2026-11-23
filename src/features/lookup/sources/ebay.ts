import { z } from "zod";
import { divRoundHalfUp } from "@/lib/calc";
import { hasRapidApiEnv, rapidApiEnv } from "@/lib/env";
import { formatDate } from "@/lib/format";
import {
  PriceSourceError,
  type PricePoint,
  type PriceResult,
  type PriceSource,
  type SourceQuota,
  type SourceSearch,
} from "../types";

/**
 * eBay sold listings, through the RapidAPI product "eBay Average Selling Price".
 *
 * Checked against the live API on 2026-11-23:
 * - `GET https://ebay-average-selling-price.p.rapidapi.com/search?query=<words>` with the headers
 *   `x-rapidapi-key` and `x-rapidapi-host`. `query` is words that must appear in the listing title.
 * - It answers `{ site, currency, query, filters, max_pages, next_cursor, count, took_ms, results[] }`.
 *   Each result has `title`, `sale_price`, `shipping_price`, `currency`, `condition`, `condition_raw`, `date_sold`
 *   (ISO), `buying_format`, `bids`, `best_offer_available`, `location`, `item_id`, `epid`, `categoryId`,
 *   `item_link` and `image_url`. One call returned the 100 most recent sales.
 * - It has no summary prices, so the median, average, low and high are worked out here.
 * - The older `POST /findCompletedItems` still answers, but its response says it is deprecated in favour of `/search`.
 * - The free plan allows 50 requests a month. A request the API rejects with HTTP 400 still uses one.
 *   The allowance comes back in the `x-ratelimit-requests-*` headers.
 *
 * Other `/search` parameters (category, paging with `next_cursor`, filters) exist but were not tried, to save quota.
 */

export const EBAY_ID = "ebay";
export const EBAY_RAPIDAPI_HOST = "ebay-average-selling-price.p.rapidapi.com";
const TIMEOUT_MS = 20_000;

const soldItemSchema = z.object({
  title: z.string(),
  sale_price: z.number().nonnegative(),
  shipping_price: z.number().nonnegative().nullish(),
  condition: z.string().nullish(),
  condition_raw: z.string().nullish(),
  date_sold: z.string().nullish(),
  buying_format: z.string().nullish(),
  item_id: z.union([z.string(), z.number()]).nullish(),
  item_link: z.string().nullish(),
  // `/findCompletedItems` calls the link `link`. Accepting both keeps the mapper working if the field is renamed back.
  link: z.string().nullish(),
  image_url: z.string().nullish(),
});

const searchResponseSchema = z.object({
  results: z.array(z.unknown()),
});

/**
 * Turns a dollar amount from the API's JSON into integer cents.
 * It goes through the two-decimal text form, so 34.95 is exactly 3495 and no float arithmetic touches money.
 */
function dollarsToCents(dollars: number): number {
  return Number(dollars.toFixed(2).replace(".", ""));
}

function httpsUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).protocol === "https:" ? value : null;
  } catch {
    return null;
  }
}

function sentenceCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/** The median of sorted integer cents. With an even count it is the mean of the middle two, rounded half up. */
function medianCents(sorted: readonly number[]): number | null {
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  if (upper === undefined) return null;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[middle - 1];
  return lower === undefined ? upper : divRoundHalfUp(lower + upper, 2);
}

/** Median, average, low and high of the sold prices, shipping left out. Empty if there are no sales. */
export function summarizeSoldPrices(soldCents: readonly number[]): PricePoint[] {
  if (soldCents.length === 0) return [];
  const sorted = [...soldCents].sort((a, b) => a - b);
  const total = sorted.reduce((sum, cents) => sum + cents, 0);
  return [
    { key: "median", label: "Median", cents: medianCents(sorted) },
    { key: "average", label: "Average", cents: divRoundHalfUp(total, sorted.length) },
    { key: "low", label: "Low", cents: sorted[0] ?? null },
    { key: "high", label: "High", cents: sorted[sorted.length - 1] ?? null },
  ];
}

/** "Used · Buy It Now · Sold Nov 23, 2026", leaving out whatever the listing does not have. */
function soldSubtitle(item: z.infer<typeof soldItemSchema>): string | null {
  const parts: string[] = [];
  const condition = item.condition_raw || item.condition;
  if (condition) parts.push(sentenceCase(condition));
  if (item.buying_format) parts.push(item.buying_format);
  if (item.date_sold) {
    const sold = new Date(item.date_sold);
    if (!Number.isNaN(sold.getTime())) parts.push(`Sold ${formatDate(sold)}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Maps a `/search` response body to results and a price summary.
 * A listing that is missing its title or price is skipped. If the body is not the expected shape at all, it throws.
 */
export function mapEbaySearchResponse(body: unknown, options: { query: string; quota?: SourceQuota | null }): SourceSearch {
  const parsed = searchResponseSchema.safeParse(body);
  if (!parsed.success) {
    throw new PriceSourceError("unexpected_response", "The eBay sold-listings API answered in a format this app does not know.");
  }
  const results: PriceResult[] = [];
  const soldCents: number[] = [];
  parsed.data.results.forEach((raw, index) => {
    const item = soldItemSchema.safeParse(raw);
    if (!item.success) return;
    const price = dollarsToCents(item.data.sale_price);
    soldCents.push(price);
    const shipping = item.data.shipping_price;
    results.push({
      id: item.data.item_id != null ? String(item.data.item_id) : `row-${index}`,
      source: EBAY_ID,
      title: item.data.title,
      itemTitle: item.data.title,
      searchText: null,
      subtitle: soldSubtitle(item.data),
      prices: [
        { key: "sold", label: "Sold", cents: price },
        { key: "shipping", label: "Shipping", cents: shipping == null ? null : dollarsToCents(shipping) },
      ],
      url: httpsUrl(item.data.item_link ?? item.data.link),
      imageUrl: httpsUrl(item.data.image_url),
      identifier: null,
    });
  });
  return {
    results,
    summary: summarizeSoldPrices(soldCents),
    searchUrl: `https://www.ebay.com/sch/i.html?${new URLSearchParams({ _nkw: options.query, LH_Sold: "1", LH_Complete: "1" }).toString()}`,
    notice: null,
    quota: options.quota ?? null,
  };
}

function headerInt(headers: Headers, name: string): number | null {
  const value = headers.get(name);
  if (value === null || !/^\d+$/.test(value)) return null;
  return Number(value);
}

/** Reads RapidAPI's allowance headers. `reset` is the number of seconds until the allowance starts again. */
export function readRapidApiQuota(headers: Headers, now: Date = new Date()): SourceQuota | null {
  const limit = headerInt(headers, "x-ratelimit-requests-limit");
  const remaining = headerInt(headers, "x-ratelimit-requests-remaining");
  const resetSeconds = headerInt(headers, "x-ratelimit-requests-reset");
  if (limit === null && remaining === null) return null;
  return {
    limit,
    remaining,
    resetsAt: resetSeconds === null ? null : new Date(now.getTime() + resetSeconds * 1000).toISOString(),
  };
}

/** The `message` or `error` text of an error body, shortened. RapidAPI and the API itself use different keys. */
function upstreamMessage(body: unknown): string | null {
  const parsed = z.object({ message: z.string().optional(), error: z.string().optional() }).safeParse(body);
  const message = parsed.success ? (parsed.data.message ?? parsed.data.error) : undefined;
  return message ? message.slice(0, 200) : null;
}

const SETUP_HINT = "Set RAPIDAPI_KEY to a RapidAPI key subscribed to “eBay Average Selling Price”, then restart the app.";

export const ebaySource: PriceSource = {
  id: EBAY_ID,
  label: "eBay sold",
  siteName: "eBay",
  description: "Recently sold listings whose title has every word of the search.",
  isConfigured: hasRapidApiEnv,
  setupHint: SETUP_HINT,

  async search(query) {
    if (!hasRapidApiEnv()) throw new PriceSourceError("not_configured", SETUP_HINT);
    const { RAPIDAPI_KEY } = rapidApiEnv();
    let response: Response;
    try {
      response = await fetch(`https://${EBAY_RAPIDAPI_HOST}/search?${new URLSearchParams({ query }).toString()}`, {
        headers: { "x-rapidapi-key": RAPIDAPI_KEY, "x-rapidapi-host": EBAY_RAPIDAPI_HOST },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PriceSourceError("unavailable", "The eBay sold-listings API did not answer. Try again in a moment.");
    }

    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // A body that is not JSON is handled below as an unexpected response.
    }

    if (!response.ok) {
      const detail = upstreamMessage(body);
      const suffix = detail ? ` It said: “${detail}”` : "";
      if (response.status === 429) {
        throw new PriceSourceError("quota", `The RapidAPI request allowance is used up (HTTP 429).${suffix}`, 429);
      }
      if (response.status === 401 || response.status === 403) {
        throw new PriceSourceError(
          "refused",
          `RapidAPI refused the key (HTTP ${response.status}). Check that it is subscribed to “eBay Average Selling Price”.${suffix}`,
          response.status,
        );
      }
      throw new PriceSourceError(
        "unavailable",
        `The eBay sold-listings API answered with HTTP ${response.status}.${suffix}`,
        response.status,
      );
    }
    return mapEbaySearchResponse(body, { query, quota: readRapidApiQuota(response.headers) });
  },
};
