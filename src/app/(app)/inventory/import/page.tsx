import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { ImportWizard } from "@/features/inventory/components/ImportWizard";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain";
import { todayIsoDate } from "@/lib/format";

export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage() {
  const userId = await requireUser();
  const categories = await loadCategories(getDb(), userId);
  return (
    <>
      <PageHeader
        title="Import CSV"
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Import CSV" }]}
        description="Bring in the spreadsheet you already keep. You choose which column is which."
      />
      <ImportWizard categories={categories} today={todayIsoDate()} />
    </>
  );
}
