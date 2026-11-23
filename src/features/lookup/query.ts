import { guessIdentifierType, normalizeIdentifier, type IdentifierType } from "@/lib/schemas";
import type { PriceResult } from "./types";

export const MAX_QUERY_LENGTH = 200;

/** Trims the query and collapses runs of whitespace. Returns null if nothing is left or it is too long. */
export function cleanQuery(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0 || cleaned.length > MAX_QUERY_LENGTH) return null;
  return cleaned;
}

/**
 * The cache key for a query.
 * Case and spacing are ignored, so "Mario  Kart" and "mario kart" share one cached answer.
 * If the query is a barcode, the dashes and spaces are dropped too.
 */
export function normalizeQuery(query: string): string {
  const identifier = queryIdentifier(query);
  if (identifier) return identifier.value.toLowerCase();
  return query.replace(/\s+/g, " ").trim().toLowerCase();
}

/** If the query looks like a UPC, EAN, ISBN or ASIN, returns it normalized. Otherwise null. */
export function queryIdentifier(query: string): { type: IdentifierType; value: string } | null {
  const type = guessIdentifierType(query);
  if (type === "other") return null;
  // guessIdentifierType ignores spaces and dashes. The ASIN normalizer only trims, so strip them here.
  const value = normalizeIdentifier(type, query.replace(/[\s-]/g, ""));
  return value ? { type, value } : null;
}

/**
 * The link that starts "Add item" from a result. Nothing is saved until that form is submitted.
 * The identifier is the one the source reported. If it reported none and the search was a barcode, that barcode is used.
 */
export function addToInventoryHref(result: Pick<PriceResult, "itemTitle" | "identifier">, query: string): string {
  const params = new URLSearchParams({ title: result.itemTitle });
  const identifier = result.identifier ?? queryIdentifier(query);
  if (identifier) {
    params.set("identifier", identifier.value);
    params.set("identifierType", identifier.type);
  }
  return `/inventory/new?${params.toString()}`;
}

export function lookupHref(query: string): string {
  return `/lookup?${new URLSearchParams({ q: query }).toString()}`;
}
