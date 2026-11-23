import type { Metadata } from "next";
import { PageHeader } from "@/components/shell/PageHeader";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { CommissionForm } from "@/features/settings/components/CommissionForm";
import { loadCommissionDefaults } from "@/features/settings/data";

export const metadata: Metadata = { title: "Default commission" };

export default async function Page() {
  const userId = await requireUser();
  const defaults = await loadCommissionDefaults(getDb(), userId);
  return (
    <>
      <PageHeader
        title="Default commission"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Commission" }]}
        description="The cut someone else earns on your sales, used to fill in new listings."
      />
      <CommissionForm defaults={defaults} />
    </>
  );
}
