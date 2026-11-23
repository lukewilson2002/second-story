import * as cheerio from "cheerio";
import { parseDollarsToCents } from "@/lib/format";
import { PriceSourceError, type PricePoint, type PriceResult, type PriceSource, type SourceSearch } from "../types";

/**
 * PriceCharting, read from its public search page.
 *
 * There is no API call here: the page is fetched like a browser would and the result table is parsed.
 * That breaks if PriceCharting changes its markup, and it may be against their terms.
 * PriceCharting sells an official API. To switch, write another PriceSource and swap it in `sources/index.ts`.
 */

export const PRICECHARTING_ID = "pricecharting";
const ORIGIN = "https://www.pricecharting.com";
const TIMEOUT_MS = 12_000;

/** A plain desktop browser string. PriceCharting serves an error page to clients without one. It carries no personal details. */
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

export function priceChartingSearchUrl(query: string): string {
  return `${ORIGIN}/search-products?${new URLSearchParams({ q: query, type: "prices" }).toString()}`;
}

function text(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** "$1,642.27" gives 164227. An empty cell or "-" gives null. */
function parsePrice(value: string): number | null {
  return parseDollarsToCents(text(value));
}

function absoluteUrl(href: string | undefined): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, ORIGIN);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** "CIB Price" and "Loose Price" become "Complete" and "Loose". An empty header falls back to the usual name. */
function priceLabel(header: string, fallback: string): string {
  const label = text(header).replace(/\s*Price$/i, "");
  if (label === "") return fallback;
  return label.toUpperCase() === "CIB" ? "Complete" : label;
}

type CheerioRoot = ReturnType<typeof cheerio.load>;

/**
 * Parses a page of search results: one row per product with its platform and three prices.
 * The three columns are loose, complete and new for games.
 * If the results mix games with cards or comics, PriceCharting heads the columns Low, Mid and High instead, and those labels are kept.
 */
function parseSearchTable($: CheerioRoot): PriceResult[] {
  const table = $("#games_table");
  const labels = {
    loose: priceLabel(table.find("thead th.js-loose").first().text(), "Loose"),
    complete: priceLabel(table.find("thead th.cib_price").first().text(), "Complete"),
    new: priceLabel(table.find("thead th.new_price").first().text(), "New"),
  };
  const results: PriceResult[] = [];
  table.find("tbody tr").each((index, element) => {
    const row = $(element);
    const link = row.find("td.title > a").first();
    const title = text(link.text());
    if (title === "") return;
    const platform = text(row.find("td.console").first().text()) || null;
    const prices: PricePoint[] = [
      { key: "loose", label: labels.loose, cents: parsePrice(row.find("td.used_price .js-price").first().text()) },
      { key: "complete", label: labels.complete, cents: parsePrice(row.find("td.cib_price .js-price").first().text()) },
      { key: "new", label: labels.new, cents: parsePrice(row.find("td.new_price .js-price").first().text()) },
    ];
    results.push({
      id: row.attr("data-product") ?? `row-${index}`,
      source: PRICECHARTING_ID,
      title,
      itemTitle: platform ? `${title} (${platform})` : title,
      searchText: platform ? `${title} ${platform}` : title,
      subtitle: platform,
      prices,
      url: absoluteUrl(link.attr("href")),
      imageUrl: absoluteUrl(row.find("td.image img").first().attr("src")),
      identifier: null,
    });
  });
  return results;
}

/**
 * Parses a single product page.
 * PriceCharting sends a search straight here if it matches exactly one product, which is what a barcode search does.
 */
function parseProductPage($: CheerioRoot, finalUrl: string | null): PriceResult | null {
  const heading = $("#product_name").first();
  if (heading.length === 0) return null;
  const platform = text(heading.find("a").first().text()) || null;
  // The h1 holds the product name followed by a link to the platform. Drop the link to leave the name.
  const name = heading.clone();
  name.find("a").remove();
  const title = text(name.text()) || text($('meta[itemprop="name"]').attr("content") ?? "");
  if (title === "") return null;

  const headers = $("#price_data thead th");
  const prices: PricePoint[] = [
    { key: "loose", label: priceLabel(headers.eq(0).text(), "Loose"), cents: parsePrice($("#used_price .price").first().text()) },
    { key: "complete", label: priceLabel(headers.eq(1).text(), "Complete"), cents: parsePrice($("#complete_price .price").first().text()) },
    { key: "new", label: priceLabel(headers.eq(2).text(), "New"), cents: parsePrice($("#new_price .price").first().text()) },
  ];

  // A product can list several UPCs (reprints). The first is used.
  const upc = text($('tr[itemprop="identifier"] td.details').first().text()).split(",")[0]?.replace(/\D/g, "") ?? "";

  const pageUrl = absoluteUrl($('meta[itemprop="url"]').attr("content")) ?? (finalUrl ? stripQuery(finalUrl) : null);
  return {
    id: heading.attr("title") ?? pageUrl ?? title,
    source: PRICECHARTING_ID,
    title,
    itemTitle: platform ? `${title} (${platform})` : title,
    searchText: platform ? `${title} ${platform}` : title,
    subtitle: platform,
    prices,
    url: pageUrl,
    imageUrl: absoluteUrl($("#product_details .cover img").first().attr("src")),
    identifier: upc.length >= 12 ? { type: upc.length === 12 ? "upc" : "ean", value: upc } : null,
  };
}

function stripQuery(url: string): string | null {
  const parsed = absoluteUrl(url);
  if (!parsed) return null;
  const copy = new URL(parsed);
  copy.search = "";
  return copy.toString();
}

/**
 * Turns the HTML that came back for a search into results.
 * It decides by what is on the page, not by the address, whether this is a result list or a single product.
 * If neither is found the markup has changed, and it throws so the owner sees an error instead of "no results".
 */
export function parsePriceChartingHtml(html: string, options: { query: string; finalUrl?: string | null }): SourceSearch {
  const $ = cheerio.load(html);
  const searchUrl = priceChartingSearchUrl(options.query);
  const base = { summary: [], searchUrl, quota: null };

  if ($("#games_table").length > 0) {
    // If nothing matches, PriceCharting swaps in a looser search and lists unrelated products under this notice.
    const revised = /Search Revised \(no results found\)/i.test($("body").text());
    if (revised) return { ...base, results: [], notice: null };
    return { ...base, results: parseSearchTable($), notice: null };
  }

  const product = parseProductPage($, options.finalUrl ?? null);
  if (product) {
    return { ...base, results: [product], notice: "PriceCharting matched this search to one product." };
  }

  throw new PriceSourceError(
    "unexpected_response",
    "PriceCharting returned a page this app could not read. Its layout may have changed.",
  );
}

export const priceChartingSource: PriceSource = {
  id: PRICECHARTING_ID,
  label: "PriceCharting",
  siteName: "PriceCharting",
  description: "Price guide for video games: loose, complete and new.",
  isConfigured: () => true,
  setupHint: "",

  async search(query) {
    let response: Response;
    try {
      response = await fetch(priceChartingSearchUrl(query), {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new PriceSourceError("unavailable", "PriceCharting did not answer. Try again in a moment.");
    }
    if (response.status === 429 || response.status === 403) {
      throw new PriceSourceError(
        "refused",
        `PriceCharting refused the request (HTTP ${response.status}). It may be limiting automated searches.`,
        response.status,
      );
    }
    if (!response.ok) {
      throw new PriceSourceError("unavailable", `PriceCharting answered with HTTP ${response.status}.`, response.status);
    }
    return parsePriceChartingHtml(await response.text(), { query, finalUrl: response.url });
  },
};
