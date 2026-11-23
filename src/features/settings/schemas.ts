import { z } from "zod";
import {
  optionalDollarsFieldSchema,
  optionalPercentFieldSchema,
  optionalTextSchema,
  uuidSchema,
  type FeeRuleInput,
} from "@/lib/schemas";

/** Form schemas for Settings. Each one parses the strings a form posts. Safe to import from Client Components. */

export const NAME_MAX_LENGTH = 80;

/** A category or marketplace name. Runs of spaces become one space, so "Blu  ray" and "Blu ray" cannot both exist. */
export const nameFieldSchema = z
  .string()
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(1, "Enter a name").max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer`));

/** A select that posts "" for "none". An empty or missing value becomes null. */
const optionalIdFieldSchema = z
  .string()
  .optional()
  .transform((value) => (value === undefined || value === "" ? null : value))
  .pipe(uuidSchema.nullable());

/** A hidden "true" or "false" field. */
const booleanFieldSchema = z.enum(["true", "false"]).transform((value) => value === "true");

/**
 * A checkbox. A checked box posts its value and an unchecked box posts nothing at all.
 * So a missing key means false. The form, not the schema, decides what a new record starts as.
 */
const checkboxFieldSchema = z
  .string()
  .optional()
  .transform((value) => value !== undefined);

export const createCategorySchema = z.object({
  name: nameFieldSchema,
  /** "" is the top level. */
  parentId: optionalIdFieldSchema,
});
export type CreateCategoryInput = z.output<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  id: uuidSchema,
  name: nameFieldSchema,
  /** "" is the top level. */
  parentId: optionalIdFieldSchema,
});
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;

export const setArchivedSchema = z.object({
  id: uuidSchema,
  archived: booleanFieldSchema,
});
export type SetArchivedInput = z.output<typeof setArchivedSchema>;

export const createMarketplaceSchema = z.object({ name: nameFieldSchema });
export type CreateMarketplaceInput = z.output<typeof createMarketplaceSchema>;

export const renameMarketplaceSchema = z.object({ id: uuidSchema, name: nameFieldSchema });
export type RenameMarketplaceInput = z.output<typeof renameMarketplaceSchema>;

export const deleteFeeRuleSchema = z.object({ id: uuidSchema });

/** What `saveFeeRule` takes: the shared fee rule values, plus the id of the rule being edited (null for a new rule). */
export interface SaveFeeRuleInput extends FeeRuleInput {
  id: string | null;
}

/**
 * The fee rule form. Percent and dollar fields may be left empty, which means 0.
 * An empty category is the marketplace default.
 * The two percentages together must stay under 100%, because at 100% no price can ever break even.
 */
export const feeRuleFormSchema = z
  .object({
    id: optionalIdFieldSchema,
    marketplaceId: uuidSchema,
    categoryId: optionalIdFieldSchema,
    percent: optionalPercentFieldSchema,
    appliesToShipping: checkboxFieldSchema,
    fixed: optionalDollarsFieldSchema,
    paymentPercent: optionalPercentFieldSchema,
    paymentFixed: optionalDollarsFieldSchema,
  })
  .refine((form) => (form.percent ?? 0) + (form.paymentPercent ?? 0) < 10_000, {
    message: "The two percentages together must be under 100%",
    path: ["paymentPercent"],
  })
  .transform(
    (form): SaveFeeRuleInput => ({
      id: form.id,
      marketplaceId: form.marketplaceId,
      categoryId: form.categoryId,
      percentBps: form.percent ?? 0,
      appliesToShipping: form.appliesToShipping,
      fixedCents: form.fixed,
      paymentPercentBps: form.paymentPercent ?? 0,
      paymentFixedCents: form.paymentFixed,
    }),
  );

/** Default commission. Both fields may be empty, which stores null and leaves new listings without a prefill. */
export const commissionSchema = z
  .object({
    percent: optionalPercentFieldSchema,
    payee: optionalTextSchema.pipe(
      z.string().max(NAME_MAX_LENGTH, `Use ${NAME_MAX_LENGTH} characters or fewer`).nullable(),
    ),
  })
  .transform((form) => ({ defaultCommissionBps: form.percent, defaultCommissionPayee: form.payee }));
export type CommissionInput = z.output<typeof commissionSchema>;
