import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Add item" };

/** PLACEHOLDER from the foundation. The inventory feature replaces this page. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ title?: string; identifier?: string; identifierType?: string }>;
}) {
  await requireUser();
  // Prefill comes from ?title=&identifier=&identifierType= (price lookup and barcode scan link here).
  await searchParams;
  return (
    <Placeholder
      title="Add item"
      owner="inventory"
      breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "New" }]}
    />
  );
}
