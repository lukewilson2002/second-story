import { z } from "zod";
import { parseDollarsToCents } from "@/lib/format";
import {
  MAX_INT,
  optionalDollarsFieldSchema,
  optionalPercentFieldSchema,
  optionalTextSchema,
  quantityFieldSchema,
  quantitySchema,
  requiredTextSchema,
  uuidSchema,
} from "@/lib/schemas";

export const LISTING_INTENTS = ["draft", "publish"] as const;
/**
 * What the pressed button asks for.
 * "draft" keeps a new or draft listing as a draft.
 * "publish" makes the listing active, or keeps an active listing active. It is also what "Save changes" and "Relist" send.
 */
export type ListingIntent = (typeof LISTING_INTENTS)[number];

/**
 * The form posts each list as one JSON string in a hidden field.
 * `formDataToObject` gives a string, not an array, when a repeated key appears once, so repeated fields would break with one item.
 */
function jsonField<T extends z.ZodType>(schema: T) {
  return z
    .string()
    .optional()
    .transform((value, ctx): unknown => {
      if (value === undefined || value.trim() === "") return [];
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "The form was not sent correctly. Reload and try again." });
        return z.NEVER;
      }
    })
    .pipe(schema);
}

const listingItemInputSchema = z.object({
  itemId: uuidSchema,
  quantityPerUnit: quantitySchema,
});

const listingMarketplaceInputSchema = z
  .object({
    marketplaceId: uuidSchema,
    /** The link to the live listing, as typed. Empty means none yet. */
    url: z.string().trim().max(2000).default(""),
    /** The price override, as typed. Empty means the listing's asking price applies. */
    price: z.string().trim().max(40).default(""),
  })
  .transform((input, ctx) => {
    let externalUrl: string | null = null;
    if (input.url !== "") {
      if (/^https?:\/\/\S+$/i.test(input.url) && URL.canParse(input.url)) {
        externalUrl = input.url;
      } else {
        ctx.addIssue({ code: "custom", message: "Enter a link that starts with https://", path: ["url"] });
      }
    }
    let askingPriceCents: number | null = null;
    if (input.price !== "") {
      const cents = parseDollarsToCents(input.price);
      if (cents === null || cents > MAX_INT) {
        ctx.addIssue({ code: "custom", message: "Enter an amount like 12.50", path: ["price"] });
      } else {
        askingPriceCents = cents;
      }
    }
    return { marketplaceId: input.marketplaceId, externalUrl, askingPriceCents };
  });

function hasDuplicates(ids: readonly string[]): boolean {
  return new Set(ids).size !== ids.length;
}

/**
 * The listing form, as posted. Used by the form and by the save action.
 * A draft only needs a title. Publishing also needs an item, a marketplace and an asking price.
 */
export const listingFormSchema = z
  .object({
    intent: z.enum(LISTING_INTENTS),
    title: requiredTextSchema,
    askingPrice: optionalDollarsFieldSchema,
    quantity: quantityFieldSchema,
    shippingCharged: optionalDollarsFieldSchema,
    estShippingCost: optionalDollarsFieldSchema,
    commissionPercent: optionalPercentFieldSchema,
    commissionPayee: optionalTextSchema,
    items: jsonField(z.array(listingItemInputSchema).max(200)),
    marketplaces: jsonField(z.array(listingMarketplaceInputSchema).max(100)),
  })
  .superRefine((value, ctx) => {
    if (hasDuplicates(value.items.map((item) => item.itemId))) {
      ctx.addIssue({ code: "custom", message: "An item is in the list twice.", path: ["items"] });
    }
    if (hasDuplicates(value.marketplaces.map((row) => row.marketplaceId))) {
      ctx.addIssue({ code: "custom", message: "A marketplace is picked twice.", path: ["marketplaces"] });
    }
    if (value.intent === "draft") return;
    if (value.items.length === 0) {
      ctx.addIssue({ code: "custom", message: "Add at least one item from inventory.", path: ["items"] });
    }
    if (value.marketplaces.length === 0) {
      ctx.addIssue({ code: "custom", message: "Pick at least one marketplace.", path: ["marketplaces"] });
    }
    if (value.askingPrice <= 0) {
      ctx.addIssue({ code: "custom", message: "Enter an asking price.", path: ["askingPrice"] });
    }
  })
  .transform((value) => ({
    intent: value.intent,
    title: value.title,
    askingPriceCents: value.askingPrice,
    quantity: value.quantity,
    shippingChargedCents: value.shippingCharged,
    estShippingCostCents: value.estShippingCost,
    // A 0% share is the same as no commission, and a payee without a share means nothing.
    commissionBps: value.commissionPercent === 0 ? null : value.commissionPercent,
    commissionPayee: value.commissionPercent ? value.commissionPayee : null,
    items: value.items,
    marketplaces: value.marketplaces,
  }));

export type ListingFormInput = z.infer<typeof listingFormSchema>;

/** The name typed into the "New marketplace" field on the listing form. */
export const newMarketplaceSchema = z.object({
  name: z.string().trim().min(1, "Enter a name").max(80, "Use 80 characters or fewer"),
});

export const LISTING_TABS = ["active", "sold", "ended", "draft"] as const;
export type ListingTab = (typeof LISTING_TABS)[number];

export const LISTING_FILTERS = ["below-minimum", "stale", "still-up"] as const;
/** The dashboard's needs-attention links: `/listings?filter=...`. */
export type ListingFilter = (typeof LISTING_FILTERS)[number];

/**
 * Reads `?tab=` and `?filter=` from the listings URL.
 * If a filter is set, it picks the tab: "still-up" lives on Sold, the other two on Active.
 * Anything unknown falls back to the Active tab with no filter.
 */
export function parseListingsQuery(query: { tab?: string | undefined; filter?: string | undefined }): {
  tab: ListingTab;
  filter: ListingFilter | null;
} {
  const filter = LISTING_FILTERS.find((value) => value === query.filter) ?? null;
  if (filter) return { tab: filter === "still-up" ? "sold" : "active", filter };
  return { tab: LISTING_TABS.find((value) => value === query.tab) ?? "active", filter: null };
}
