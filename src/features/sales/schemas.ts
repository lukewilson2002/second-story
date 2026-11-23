import { z } from "zod";
import { parseDollarsToCents } from "@/lib/format";
import {
  dollarsFieldSchema,
  isoDateSchema,
  MAX_INT,
  optionalDollarsFieldSchema,
  quantityFieldSchema,
  uuidSchema,
} from "@/lib/schemas";

/**
 * The marketplace fee field on the mark-sold form.
 * If it is empty or missing, the result is undefined and `recordSale` works the fee out from the fee rule.
 * `optionalDollarsFieldSchema` would turn an empty field into 0, which would record a sale with no fee.
 */
const feeOverrideFieldSchema = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value.trim() === "") return undefined;
    const cents = parseDollarsToCents(value);
    if (cents === null || cents > MAX_INT) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50" });
      return z.NEVER;
    }
    return cents;
  });

/** The mark-sold form, as posted. Its output is the input `recordSale` takes. */
export const markSoldFormSchema = z
  .object({
    listingId: uuidSchema,
    marketplaceId: z.uuid("Pick the marketplace it sold on"),
    soldAt: isoDateSchema,
    /** Left out by the form when the listing has one unit left. */
    quantity: quantityFieldSchema.optional(),
    /** Total item price paid, across all units in the sale. */
    salePrice: dollarsFieldSchema,
    shippingCost: optionalDollarsFieldSchema,
    additionalFees: optionalDollarsFieldSchema,
    marketplaceFee: feeOverrideFieldSchema,
  })
  .transform((value) => ({
    listingId: value.listingId,
    marketplaceId: value.marketplaceId,
    soldAt: value.soldAt,
    quantity: value.quantity ?? 1,
    salePriceCents: value.salePrice,
    shippingCostCents: value.shippingCost,
    additionalFeesCents: value.additionalFees,
    // Under exactOptionalPropertyTypes the key must be absent, not undefined, to mean "use the fee rule".
    ...(value.marketplaceFee === undefined ? {} : { marketplaceFeeCents: value.marketplaceFee }),
  }));

export type MarkSoldInput = z.infer<typeof markSoldFormSchema>;

export const SALES_FILTERS = ["all", "commission-owed"] as const;
export type SalesFilter = (typeof SALES_FILTERS)[number];

/** Reads `?filter=` from the sales URL. The dashboard links to `/sales?filter=commission-owed`. */
export function parseSalesFilter(value: string | undefined): SalesFilter {
  return SALES_FILTERS.find((filter) => filter === value) ?? "all";
}
