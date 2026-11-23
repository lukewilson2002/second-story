import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { ButtonLink } from "@/components/ui";
import { InventoryTable } from "@/features/inventory/components/InventoryTable";
import { loadInventoryRows } from "@/features/inventory/data";
import { inventoryTotals } from "@/features/inventory/logic";
import { requireUser } from "@/lib/auth";
import { cloudinaryImageUrl } from "@/lib/cloudinary";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain";
import { formatCents, formatCount, todayIsoDate } from "@/lib/format";
import { itemStatusSchema } from "@/lib/schemas";

export const metadata: Metadata = { title: "Inventory" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const today = todayIsoDate();
  const categories = await loadCategories(db, userId);
  const rows = (await loadInventoryRows(db, userId, today)).map(({ thumbnailPublicId, ...row }) => ({
    ...row,
    thumbnailUrl: thumbnailPublicId ? cloudinaryImageUrl(thumbnailPublicId, { width: 40, height: 40 }) : null,
  }));
  const totals = inventoryTotals(rows);
  const status = itemStatusSchema.safeParse(first(params.status));
  const categoryId = first(params.category);

  return (
    <>
      <PageHeader
        title="Inventory"
        description={`${formatCount(totals.items)} ${totals.items === 1 ? "item" : "items"}, ${formatCount(totals.units)} ${
          totals.units === 1 ? "unit" : "units"
        } in stock, ${formatCents(totals.costCents, { whole: true })} cost`}
        actions={<ButtonLink href="/inventory/import">Import CSV</ButtonLink>}
      />
      <InventoryTable
        rows={rows}
        categories={categories}
        today={today}
        initialQuery={first(params.q)}
        initialStatus={status.success ? status.data : "all"}
        initialCategoryId={categories.some((category) => category.id === categoryId) ? categoryId : ""}
      />
    </>
  );
}
