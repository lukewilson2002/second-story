"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError, actionOk, formDataToObject, validationError, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { uuidSchema } from "@/lib/schemas";
import { createMarketplace, deleteDraftListing, endListing, endListingMarketplace, saveListing } from "./data";
import { listingFormSchema, newMarketplaceSchema } from "./schemas";
import type { MarketplaceOption } from "./types";

function revalidateListingPages(listingId?: string): void {
  // Item status ("Listed") and the dashboard tiles both depend on listings.
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/listings");
  revalidatePath("/sales/new");
  if (listingId) revalidatePath(`/listings/${listingId}`);
}

/** Saves the listing form. Bind the listing id for an edit, or null for a new listing. */
export async function saveListingAction(
  listingId: string | null,
  _previous: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const userId = await requireUser();
  const parsed = listingFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  let saved: { id: string; status: "draft" | "active" };
  try {
    saved = await saveListing(getDb(), userId, parsed.data, listingId ?? undefined);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidateListingPages(saved.id);
  redirect(saved.status === "draft" ? "/listings?tab=draft" : "/listings");
}

/** Adds a marketplace from the listing form's "New marketplace" pill. */
export async function createMarketplaceAction(name: string): Promise<ActionResult<MarketplaceOption>> {
  const userId = await requireUser();
  const parsed = newMarketplaceSchema.safeParse({ name });
  if (!parsed.success) return actionError(parsed.error.issues[0]?.message ?? "Enter a name");
  try {
    const marketplace = await createMarketplace(getDb(), userId, parsed.data.name);
    revalidatePath("/settings/marketplaces");
    revalidatePath("/listings", "layout");
    return actionOk(marketplace);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
}

function isId(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

/** Ends a listing everywhere. */
export async function endListingAction(listingId: string): Promise<ActionResult> {
  const userId = await requireUser();
  if (!isId(listingId)) return actionError("That listing does not exist.");
  try {
    await endListing(getDb(), userId, listingId);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidateListingPages(listingId);
  return actionOk();
}

/** Takes a listing down from one marketplace. */
export async function endListingMarketplaceAction(listingId: string, marketplaceId: string): Promise<ActionResult> {
  const userId = await requireUser();
  if (!isId(listingId) || !isId(marketplaceId)) return actionError("That listing does not exist.");
  try {
    await endListingMarketplace(getDb(), userId, listingId, marketplaceId);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidateListingPages(listingId);
  return actionOk();
}

/** Deletes a draft. The caller navigates away afterwards, because the listing's page no longer exists. */
export async function deleteDraftListingAction(listingId: string): Promise<ActionResult> {
  const userId = await requireUser();
  if (!isId(listingId)) return actionError("That listing does not exist.");
  try {
    await deleteDraftListing(getDb(), userId, listingId);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidateListingPages();
  return actionOk();
}
