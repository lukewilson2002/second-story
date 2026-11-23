import { z } from "zod";
import { parseDollarsToCents, parsePercentToBps } from "@/lib/format";

/**
 * Zod schemas shared across features. Safe to import from Server and Client Components.
 * A form's own schema lives in its feature folder and is built from these pieces.
 */

/** Postgres `integer` is 32-bit, so money columns top out at $21,474,836.47. */
export const MAX_INT = 2_147_483_647;

export const uuidSchema = z.uuid();

/** Integer cents, zero or more. */
export const centsSchema = z.number().int().min(0).max(MAX_INT);

/** Basis points from 0 to 10000 (0% to 100%). */
export const bpsSchema = z.number().int().min(0).max(10_000);

/** A whole quantity of at least 1. */
export const quantitySchema = z.number().int().min(1).max(1_000_000);

/** A calendar date as "YYYY-MM-DD" that really exists. */
export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, "Enter a real date");

/** A required one-line text field. Trims the value. */
export const requiredTextSchema = z.string().trim().min(1, "This is required").max(500);

/** An optional text field. Trims the value and turns an empty string into null. */
export const optionalTextSchema = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

/**
 * A dollar amount as typed into a form field ("44.99", "$44.99"), turned into integer cents.
 * An empty string fails. Use `optionalDollarsFieldSchema` for fields that default to $0.00.
 */
export const dollarsFieldSchema = z.string().transform((value, ctx) => {
  const cents = parseDollarsToCents(value);
  if (cents === null || cents > MAX_INT) {
    ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50" });
    return z.NEVER;
  }
  return cents;
});

/** Like `dollarsFieldSchema`, but an empty or missing field becomes 0 cents. */
export const optionalDollarsFieldSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === "") return 0;
    const cents = parseDollarsToCents(value);
    if (cents === null || cents > MAX_INT) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50" });
      return z.NEVER;
    }
    return cents;
  });

/** A percentage as typed into a form field ("12.5", "20%"), turned into basis points. */
export const percentFieldSchema = z.string().transform((value, ctx) => {
  const bps = parsePercentToBps(value);
  if (bps === null) {
    ctx.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100" });
    return z.NEVER;
  }
  return bps;
});

/** Like `percentFieldSchema`, but an empty or missing field becomes null. */
export const optionalPercentFieldSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === "") return null;
    const bps = parsePercentToBps(value);
    if (bps === null) {
      ctx.addIssue({ code: "custom", message: "Enter a percentage from 0 to 100" });
      return z.NEVER;
    }
    return bps;
  });

/** A whole number as typed into a form field, at least 1. */
export const quantityFieldSchema = z
  .string()
  .trim()
  .regex(/^\d+$/, "Enter a whole number")
  .transform(Number)
  .pipe(quantitySchema);

export const IDENTIFIER_TYPES = ["upc", "ean", "isbn10", "isbn13", "asin", "sku", "other"] as const;
export const identifierTypeSchema = z.enum(IDENTIFIER_TYPES);
export type IdentifierType = z.infer<typeof identifierTypeSchema>;

export const IDENTIFIER_TYPE_LABELS: Record<IdentifierType, string> = {
  upc: "UPC",
  ean: "EAN",
  isbn10: "ISBN-10",
  isbn13: "ISBN-13",
  asin: "ASIN",
  sku: "SKU",
  other: "Other",
};

/**
 * Normalizes an identifier value for storage and lookup.
 * UPC, EAN and ISBN-13 keep digits only. ISBN-10 keeps digits and a final "X" check character.
 * ASIN is uppercased. SKU and other values are trimmed.
 */
export function normalizeIdentifier(type: IdentifierType, value: string): string {
  switch (type) {
    case "upc":
    case "ean":
    case "isbn13":
      return value.replace(/\D/g, "");
    case "isbn10":
      return value.toUpperCase().replace(/[^0-9X]/g, "");
    case "asin":
      return value.trim().toUpperCase();
    case "sku":
    case "other":
      return value.trim();
  }
}

/**
 * Guesses the identifier type from a scanned or typed value.
 * 12 digits is a UPC. 13 digits starting 978 or 979 is an ISBN-13, and any other 13 digits is an EAN.
 * 10 characters ending in a digit or X is an ISBN-10. Anything else is "other".
 */
export function guessIdentifierType(value: string): IdentifierType {
  const compact = value.toUpperCase().replace(/[\s-]/g, "");
  if (/^\d{12}$/.test(compact)) return "upc";
  if (/^97[89]\d{10}$/.test(compact)) return "isbn13";
  if (/^\d{13}$/.test(compact)) return "ean";
  if (/^\d{9}[\dX]$/.test(compact)) return "isbn10";
  if (/^B0[A-Z0-9]{8}$/.test(compact)) return "asin";
  return "other";
}

/** One identifier as entered on a form. The value is normalized for its type and must not end up empty. */
export const identifierInputSchema = z
  .object({ type: identifierTypeSchema, value: z.string().max(200) })
  .transform((input) => ({ type: input.type, value: normalizeIdentifier(input.type, input.value) }))
  .refine((input) => input.value.length > 0, { message: "Enter an identifier", path: ["value"] });

export const LISTING_STATUSES = ["draft", "active", "sold", "ended"] as const;
export const listingStatusSchema = z.enum(LISTING_STATUSES);
export type ListingStatus = z.infer<typeof listingStatusSchema>;

export const LISTING_MARKETPLACE_STATUSES = ["active", "ended"] as const;
export const listingMarketplaceStatusSchema = z.enum(LISTING_MARKETPLACE_STATUSES);

export const ITEM_STATUSES = ["in_stock", "listed", "sold_out"] as const;
export const itemStatusSchema = z.enum(ITEM_STATUSES);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const ITEM_STATUS_LABELS: Record<ItemStatus, string> = {
  in_stock: "In stock",
  listed: "Listed",
  sold_out: "Sold out",
};

/** Fee rule values, already in basis points and cents. Matches the fee_rule table. */
export const feeRuleInputSchema = z.object({
  marketplaceId: uuidSchema,
  /** Null is the marketplace default. */
  categoryId: uuidSchema.nullable(),
  percentBps: bpsSchema,
  appliesToShipping: z.boolean(),
  fixedCents: centsSchema,
  paymentPercentBps: bpsSchema,
  paymentFixedCents: centsSchema,
});
export type FeeRuleInput = z.infer<typeof feeRuleInputSchema>;

/** The input to `recordSale` and `previewSale` in src/lib/domain. All money is integer cents, totals for the whole sale. */
export const recordSaleInputSchema = z.object({
  listingId: uuidSchema,
  /** Where it sold. The listing must be up on this marketplace. */
  marketplaceId: uuidSchema,
  soldAt: isoDateSchema,
  quantity: quantitySchema.default(1),
  /** Total item price paid, across all units in the sale. */
  salePriceCents: centsSchema,
  /** Total shipping the buyer paid. If left out, the listing's shipping charged × quantity is used. */
  shippingChargedCents: centsSchema.optional(),
  /** Actual label cost for the sale. */
  shippingCostCents: centsSchema.default(0),
  /** Promotions and ad fees. */
  additionalFeesCents: centsSchema.default(0),
  /** If set, this replaces the fee worked out from the fee rule, to match the real payout. */
  marketplaceFeeCents: centsSchema.optional(),
});
export type RecordSaleInput = z.input<typeof recordSaleInputSchema>;
