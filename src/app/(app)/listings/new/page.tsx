import type { Metadata } from "next";
import { ListingForm } from "@/features/listings/ListingForm";
import { loadListingFormOptions } from "@/features/listings/data";
import type { ListingFormValues } from "@/features/listings/types";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export const metadata: Metadata = { title: "New listing" };

export default async function Page({ searchParams }: { searchParams: Promise<{ items?: string | string[] }> }) {
  const userId = await requireUser();
  const query = await searchParams;
  const options = await loadListingFormOptions(getDb(), userId);

  // `?items=id,id` comes from the inventory bulk action. Ids that are unknown or out of stock are dropped.
  const requested = (Array.isArray(query.items) ? query.items.join(",") : (query.items ?? "")).split(",");
  const known = new Map(options.items.map((item) => [item.id, item]));
  const itemIds = [...new Set(requested.map((id) => id.trim()).filter((id) => known.has(id)))];
  const onlyItem = itemIds.length === 1 ? known.get(itemIds[0] ?? "") : undefined;

  const values: ListingFormValues = {
    id: null,
    status: "draft",
    title: onlyItem?.title ?? "",
    askingPriceCents: null,
    quantity: 1,
    shippingChargedCents: 0,
    estShippingCostCents: 0,
    commissionBps: options.defaultCommissionBps,
    commissionPayee: options.defaultCommissionPayee ?? "",
    items: itemIds.map((itemId) => ({ itemId, quantityPerUnit: 1 })),
    marketplaces: [],
    soldQuantity: 0,
  };

  return <ListingForm options={options} values={values} />;
}
