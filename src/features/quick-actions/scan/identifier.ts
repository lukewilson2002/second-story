import { guessIdentifierType, normalizeIdentifier, type IdentifierType } from "@/lib/schemas";

export interface ScannedIdentifier {
  identifier: string;
  identifierType: IdentifierType;
}

/**
 * Turns what the camera read, or what was typed, into an identifier and its type.
 * Spaces and hyphens are dropped, so "978-0-441-01359-3" works.
 * If the value is 13 digits starting with 0, the 0 is dropped and it is a UPC. Some scanners report a 12-digit UPC that way.
 * Returns null if nothing usable is left.
 */
export function readIdentifier(raw: string): ScannedIdentifier | null {
  let value = raw.trim();
  const compact = value.replace(/[\s-]/g, "");
  if (/^\d{8,14}$/.test(compact) || /^\d{9}[xX]$/.test(compact)) value = compact;
  if (/^0\d{12}$/.test(value)) value = value.slice(1);
  const identifierType = guessIdentifierType(value);
  const identifier = normalizeIdentifier(identifierType, value);
  if (identifier === "" || identifier.length > 200) return null;
  return { identifier, identifierType };
}

/** The Add item form with the identifier and its type filled in. */
export function addItemHref({ identifier, identifierType }: ScannedIdentifier): string {
  return `/inventory/new?${new URLSearchParams({ identifier, identifierType }).toString()}`;
}
