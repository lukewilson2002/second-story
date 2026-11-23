"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { actionError, actionOk, formDataToObject, validationError, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { getDb, type Db } from "@/lib/db";
import { DomainError } from "@/lib/domain/errors";
import {
  SettingsError,
  createCategory,
  createMarketplace,
  deleteFeeRule,
  renameMarketplace,
  saveCommissionDefaults,
  saveFeeRule,
  setCategoryArchived,
  setMarketplaceArchived,
  updateCategory,
} from "./data";
import {
  commissionSchema,
  createCategorySchema,
  createMarketplaceSchema,
  deleteFeeRuleSchema,
  feeRuleFormSchema,
  renameMarketplaceSchema,
  setArchivedSchema,
  updateCategorySchema,
} from "./schemas";

type SettingsActionResult = ActionResult<undefined>;

/**
 * The shared body of every settings action: sign-in check, parse, write, revalidate.
 * Categories, marketplaces, fee rules and the default commission feed pickers and prices on most screens, so every page is revalidated.
 */
async function run<Schema extends z.ZodType>(
  schema: Schema,
  formData: FormData,
  work: (db: Db, userId: string, input: z.output<Schema>) => Promise<unknown>,
): Promise<SettingsActionResult> {
  const userId = await requireUser();
  const parsed = schema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    await work(getDb(), userId, parsed.data);
  } catch (error) {
    if (error instanceof SettingsError && error.field) return actionError(error.message, { [error.field]: [error.message] });
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidatePath("/", "layout");
  return actionOk();
}

export async function createCategoryAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(createCategorySchema, formData, createCategory);
}

export async function updateCategoryAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(updateCategorySchema, formData, updateCategory);
}

export async function setCategoryArchivedAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(setArchivedSchema, formData, setCategoryArchived);
}

export async function createMarketplaceAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(createMarketplaceSchema, formData, createMarketplace);
}

export async function renameMarketplaceAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(renameMarketplaceSchema, formData, renameMarketplace);
}

export async function setMarketplaceArchivedAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(setArchivedSchema, formData, setMarketplaceArchived);
}

export async function saveFeeRuleAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(feeRuleFormSchema, formData, saveFeeRule);
}

export async function deleteFeeRuleAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(deleteFeeRuleSchema, formData, (db, userId, input) => deleteFeeRule(db, userId, input.id));
}

export async function saveCommissionAction(_previous: SettingsActionResult | null, formData: FormData): Promise<SettingsActionResult> {
  return run(commissionSchema, formData, saveCommissionDefaults);
}
