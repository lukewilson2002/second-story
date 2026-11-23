import { z } from "zod";
import {
  MAX_INT,
  centsSchema,
  dollarsFieldSchema,
  identifierInputSchema,
  identifierTypeSchema,
  isoDateSchema,
  optionalTextSchema,
  quantityFieldSchema,
  quantitySchema,
  requiredTextSchema,
  uuidSchema,
} from "@/lib/schemas";

/**
 * Form schemas for the inventory feature, shared by the client forms and the Server Actions.
 * Lists (identifiers, photos, lot lines, selected ids) are posted as one JSON string in a hidden field,
 * because a repeated form field arrives as a string when there is one value and an array when there are several.
 */

function jsonListField<T extends z.ZodType>(item: T, options: { min?: number; max: number; emptyMessage?: string }) {
  return z
    .string()
    .optional()
    .transform((value, ctx): unknown => {
      if (value === undefined || value.trim() === "") return [];
      try {
        return JSON.parse(value);
      } catch {
        ctx.addIssue({ code: "custom", message: "This list could not be read. Reload the page and try again." });
        return z.NEVER;
      }
    })
    .pipe(
      z
        .array(item)
        .min(options.min ?? 0, options.emptyMessage ?? "Add at least one")
        .max(options.max, `No more than ${options.max}`),
    );
}

const categoryIdSchema = z.uuid("Choose a category");

/** One uploaded photo as Cloudinary reported it. */
export const photoInputSchema = z.object({
  publicId: z.string().min(1).max(300),
  width: z.number().int().min(1).max(100_000),
  height: z.number().int().min(1).max(100_000),
});
export type PhotoInput = z.infer<typeof photoInputSchema>;

const purchaseFields = {
  quantity: quantityFieldSchema,
  unitCost: dollarsFieldSchema,
  purchasedAt: isoDateSchema,
  source: optionalTextSchema,
};

/**
 * The purchase total is summed in SQL as a 32-bit integer.
 * A quantity times a unit cost above that limit would make every later sum fail, so it is refused here.
 */
function purchaseTotalFits(value: { quantity: number; unitCost: number }, ctx: z.RefinementCtx) {
  if (value.quantity * value.unitCost > MAX_INT) {
    ctx.addIssue({ code: "custom", path: ["unitCost"], message: "That total is too large" });
  }
}

export const MAX_IDENTIFIERS = 20;
export const MAX_PHOTOS = 12;

export const createItemFormSchema = z
  .object({
    title: requiredTextSchema,
    categoryId: categoryIdSchema,
    condition: optionalTextSchema,
    storageLocation: optionalTextSchema,
    notes: optionalTextSchema,
    ...purchaseFields,
    identifiers: jsonListField(identifierInputSchema, { max: MAX_IDENTIFIERS }),
    photos: jsonListField(photoInputSchema, { max: MAX_PHOTOS }),
    /** "1" once the person has seen the possible duplicates and still wants a new item. */
    confirmNew: z.string().optional(),
  })
  .superRefine(purchaseTotalFits);

export const addStockFormSchema = z.object({ itemId: uuidSchema, ...purchaseFields }).superRefine(purchaseTotalFits);

export const updateItemFormSchema = z.object({
  itemId: uuidSchema,
  title: requiredTextSchema,
  categoryId: categoryIdSchema,
  condition: optionalTextSchema,
  storageLocation: optionalTextSchema,
  description: optionalTextSchema,
  notes: optionalTextSchema,
});

export const correctQuantityFormSchema = z.object({
  itemId: uuidSchema,
  quantity: z
    .string()
    .trim()
    .regex(/^\d+$/, "Enter a whole number, 0 or more")
    .transform(Number)
    .pipe(z.number().int().min(0).max(1_000_000)),
});

export const addIdentifierFormSchema = z.object({
  itemId: uuidSchema,
  type: identifierTypeSchema,
  value: z.string().max(200),
});

export const changeCategoryFormSchema = z.object({
  itemIds: jsonListField(uuidSchema, { min: 1, max: 5000, emptyMessage: "Select at least one item" }),
  categoryId: categoryIdSchema,
});

export const MAX_LOT_LINES = 100;

export const lotLineSchema = z.object({
  title: requiredTextSchema,
  categoryId: categoryIdSchema,
});

export const createLotFormSchema = z.object({
  totalCost: dollarsFieldSchema,
  purchasedAt: isoDateSchema,
  source: optionalTextSchema,
  storageLocation: optionalTextSchema,
  lines: jsonListField(lotLineSchema, { min: 2, max: MAX_LOT_LINES, emptyMessage: "A lot needs at least two items" }),
});

export const MAX_IMPORT_BATCH = 100;

/** One row of a CSV import, after the browser has mapped and parsed it. The server checks it again. */
export const importRowSchema = z
  .object({
    title: requiredTextSchema,
    categoryId: uuidSchema,
    condition: optionalTextSchema,
    storageLocation: optionalTextSchema,
    description: optionalTextSchema,
    notes: optionalTextSchema,
    quantity: quantitySchema,
    unitCostCents: centsSchema,
    purchasedAt: isoDateSchema,
    source: optionalTextSchema,
    identifiers: z.array(identifierInputSchema).max(MAX_IDENTIFIERS),
  })
  .refine((row) => row.quantity * row.unitCostCents <= MAX_INT, { message: "That total is too large", path: ["unitCostCents"] });
export type ImportRow = z.infer<typeof importRowSchema>;

export const importBatchSchema = z.object({
  rows: z.array(importRowSchema).min(1).max(MAX_IMPORT_BATCH),
  /** If true, a row whose title or identifier matches an existing item adds stock to it instead of creating a new item. */
  mergeDuplicates: z.boolean(),
});
