"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, actionOk, formDataToObject, validationError, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { identifierTypeSchema, uuidSchema } from "@/lib/schemas";
import { destroyCloudinaryImage } from "./cloudinary-server";
import { isOwnPublicId } from "./cloudinary-sign";
import {
  addIdentifier,
  addPhoto,
  addStock,
  changeCategory,
  correctQuantity,
  createItem,
  createLot,
  deletePhoto,
  findDuplicateItems,
  importItems,
  removeIdentifier,
  reorderPhotos,
  updateItemDetails,
  type DuplicateMatch,
  type ImportResult,
} from "./data";
import {
  MAX_PHOTOS,
  addIdentifierFormSchema,
  addStockFormSchema,
  changeCategoryFormSchema,
  correctQuantityFormSchema,
  createItemFormSchema,
  createLotFormSchema,
  importBatchSchema,
  photoInputSchema,
  updateItemFormSchema,
} from "./schemas";

/**
 * Stock, cost and category feed the dashboard, listings and sales pages as well as inventory,
 * so every write refreshes all signed-in pages.
 */
function revalidateApp(): void {
  revalidatePath("/", "layout");
}

async function run<T>(work: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    const data = await work();
    revalidateApp();
    return actionOk(data);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
}

export type CreateItemOutcome =
  | { kind: "created"; id: string; title: string }
  | { kind: "restocked"; id: string }
  /** Nothing was saved. The form shows these and asks whether to add stock or create a new item anyway. */
  | { kind: "duplicates"; matches: DuplicateMatch[] };

/**
 * Saves the add item form.
 * If `existingItemId` is posted, the purchase fields are added as stock to that item and the item fields are ignored.
 * Otherwise, if the title or an identifier matches an existing item and `confirmNew` is not "1", nothing is saved and the matches come back.
 */
export async function createItemAction(
  _previous: ActionResult<CreateItemOutcome> | null,
  formData: FormData,
): Promise<ActionResult<CreateItemOutcome>> {
  const userId = await requireUser();
  const raw = formDataToObject(formData);

  if (typeof raw.existingItemId === "string" && raw.existingItemId !== "") {
    const parsed = addStockFormSchema.safeParse({ ...raw, itemId: raw.existingItemId });
    if (!parsed.success) return validationError(parsed.error);
    const { itemId, quantity, unitCost, purchasedAt, source } = parsed.data;
    return run(async () => {
      await addStock(getDb(), userId, itemId, { quantity, unitCostCents: unitCost, purchasedAt, source });
      return { kind: "restocked", id: itemId } as const;
    });
  }

  const parsed = createItemFormSchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);
  const { quantity, unitCost, purchasedAt, source, confirmNew, ...item } = parsed.data;
  if (confirmNew !== "1") {
    const matches = await findDuplicateItems(getDb(), userId, item);
    if (matches.length > 0) return actionOk({ kind: "duplicates", matches });
  }
  return run(async () => {
    const id = await createItem(getDb(), userId, {
      ...item,
      purchase: { quantity, unitCostCents: unitCost, purchasedAt, source },
    });
    return { kind: "created", id, title: item.title } as const;
  });
}

const duplicateCheckSchema = z.object({
  title: z.string().max(500),
  identifiers: z.array(z.object({ type: identifierTypeSchema, value: z.string().max(200) })).max(20),
});

/** Looks for existing items like the one being typed, so the form can offer "add stock" before anything is saved. */
export async function checkDuplicatesAction(input: z.input<typeof duplicateCheckSchema>): Promise<DuplicateMatch[]> {
  const userId = await requireUser();
  const parsed = duplicateCheckSchema.safeParse(input);
  if (!parsed.success) return [];
  return findDuplicateItems(getDb(), userId, parsed.data);
}

export async function createLotAction(
  _previous: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const userId = await requireUser();
  const parsed = createLotFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { totalCost, ...lot } = parsed.data;
  return run(async () => {
    const ids = await createLot(getDb(), userId, { ...lot, totalCostCents: totalCost });
    return { count: ids.length };
  });
}

export async function addStockAction(
  _previous: ActionResult<{ itemId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ itemId: string }>> {
  const userId = await requireUser();
  const parsed = addStockFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { itemId, quantity, unitCost, purchasedAt, source } = parsed.data;
  return run(async () => {
    await addStock(getDb(), userId, itemId, { quantity, unitCostCents: unitCost, purchasedAt, source });
    return { itemId };
  });
}

export async function updateItemAction(
  _previous: ActionResult<{ itemId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ itemId: string }>> {
  const userId = await requireUser();
  const parsed = updateItemFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { itemId, ...details } = parsed.data;
  return run(async () => {
    await updateItemDetails(getDb(), userId, itemId, details);
    return { itemId };
  });
}

export async function correctQuantityAction(
  _previous: ActionResult<{ quantity: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ quantity: number }>> {
  const userId = await requireUser();
  const parsed = correctQuantityFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { itemId, quantity } = parsed.data;
  return run(async () => {
    await correctQuantity(getDb(), userId, itemId, quantity);
    return { quantity };
  });
}

export async function addIdentifierAction(
  _previous: ActionResult<{ itemId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ itemId: string }>> {
  const userId = await requireUser();
  const parsed = addIdentifierFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  const { itemId, type, value } = parsed.data;
  return run(async () => {
    await addIdentifier(getDb(), userId, itemId, { type, value });
    return { itemId };
  });
}

const idPairSchema = z.tuple([uuidSchema, uuidSchema]);

export async function removeIdentifierAction(itemId: string, identifierId: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  const parsed = idPairSchema.safeParse([itemId, identifierId]);
  if (!parsed.success) return actionError("That identifier could not be removed.");
  return run(async () => {
    await removeIdentifier(getDb(), userId, parsed.data[0], parsed.data[1]);
    return null;
  });
}

export async function changeCategoryAction(
  _previous: ActionResult<{ count: number }> | null,
  formData: FormData,
): Promise<ActionResult<{ count: number }>> {
  const userId = await requireUser();
  const parsed = changeCategoryFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  return run(async () => ({ count: await changeCategory(getDb(), userId, parsed.data.itemIds, parsed.data.categoryId) }));
}

/** Saves a photo the browser has just uploaded to Cloudinary. */
export async function addPhotoAction(itemId: string, photo: z.input<typeof photoInputSchema>): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUser();
  const parsed = z.object({ itemId: uuidSchema, photo: photoInputSchema }).safeParse({ itemId, photo });
  if (!parsed.success) return actionError("That photo could not be saved. Upload it again.");
  return run(async () => {
    const existing = await getDb()
      .selectFrom("item_photo")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("item_id", "=", parsed.data.itemId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    if ((existing?.count ?? 0) >= MAX_PHOTOS) {
      throw new DomainError("invalid", `An item can have up to ${MAX_PHOTOS} photos.`);
    }
    return { id: await addPhoto(getDb(), userId, parsed.data.itemId, parsed.data.photo) };
  });
}

export async function reorderPhotosAction(itemId: string, orderedIds: string[]): Promise<ActionResult<null>> {
  const userId = await requireUser();
  const parsed = z.object({ itemId: uuidSchema, orderedIds: z.array(uuidSchema).max(100) }).safeParse({ itemId, orderedIds });
  if (!parsed.success) return actionError("The photos could not be reordered.");
  return run(async () => {
    await reorderPhotos(getDb(), userId, parsed.data.itemId, parsed.data.orderedIds);
    return null;
  });
}

export async function deletePhotoAction(itemId: string, photoId: string): Promise<ActionResult<null>> {
  const userId = await requireUser();
  const parsed = idPairSchema.safeParse([itemId, photoId]);
  if (!parsed.success) return actionError("That photo could not be deleted.");
  return run(async () => {
    const publicId = await deletePhoto(getDb(), userId, parsed.data[0], parsed.data[1]);
    if (publicId) await destroyCloudinaryImage(publicId);
    return null;
  });
}

/**
 * Deletes a photo that was uploaded on the add item form and then removed before the item was saved.
 * It has no row yet, so only the Cloudinary file is deleted, and only if it is in the user's own folder.
 */
export async function discardUploadedPhotoAction(publicId: string): Promise<void> {
  const userId = await requireUser();
  if (typeof publicId !== "string" || !isOwnPublicId(publicId, userId)) return;
  const saved = await getDb()
    .selectFrom("item_photo")
    .select("id")
    .where("cloudinary_public_id", "=", publicId)
    .where("user_id", "=", userId)
    .executeTakeFirst();
  if (!saved) await destroyCloudinaryImage(publicId);
}

/** Imports one batch of mapped CSV rows. The import screen sends the file in batches and adds up the results. */
export async function importBatchAction(input: z.input<typeof importBatchSchema>): Promise<ActionResult<ImportResult>> {
  const userId = await requireUser();
  const parsed = importBatchSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error, "Some rows could not be read. Nothing from this batch was imported.");
  return run(() => importItems(getDb(), userId, parsed.data.rows, { mergeDuplicates: parsed.data.mergeDuplicates }));
}
