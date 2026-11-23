"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { actionError, actionOk, formDataToObject, validationError, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError, recordSale } from "@/lib/domain";
import { todayIsoDate } from "@/lib/format";
import { uuidSchema } from "@/lib/schemas";
import { markAllCommissionPaid, setCommissionPaid } from "./data";
import { markSoldFormSchema } from "./schemas";

function revalidateSalePages(): void {
  revalidatePath("/");
  revalidatePath("/inventory");
  revalidatePath("/listings", "layout");
  revalidatePath("/sales", "layout");
}

/** Records a sale from the mark-sold form, then goes to the sales table. */
export async function recordSaleAction(_previous: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const userId = await requireUser();
  const parsed = markSoldFormSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  if (parsed.data.soldAt > todayIsoDate()) {
    return actionError("Check the highlighted fields.", { soldAt: ["The sold date cannot be in the future"] });
  }
  let stillUpElsewhere: boolean;
  try {
    const sale = await recordSale(getDb(), userId, parsed.data);
    stillUpElsewhere = sale.stillActiveOnMarketplaceIds.length > 0;
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidateSalePages();
  // If the sold-out listing is still up somewhere else, land on it so it can be taken down there.
  redirect(stillUpElsewhere ? `/listings/${parsed.data.listingId}` : "/sales");
}

/** Marks the commission on one sale as paid today, or as owed again. */
export async function setCommissionPaidAction(saleId: string, paid: boolean): Promise<ActionResult> {
  const userId = await requireUser();
  if (!uuidSchema.safeParse(saleId).success) return actionError("That sale does not exist.");
  try {
    await setCommissionPaid(getDb(), userId, saleId, paid ? todayIsoDate() : null);
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/sales");
  return actionOk();
}

/** Marks all owed commission as paid today. */
export async function markAllCommissionPaidAction(): Promise<ActionResult<{ count: number }>> {
  const userId = await requireUser();
  const count = await markAllCommissionPaid(getDb(), userId, todayIsoDate());
  revalidatePath("/");
  revalidatePath("/sales");
  return actionOk({ count });
}
