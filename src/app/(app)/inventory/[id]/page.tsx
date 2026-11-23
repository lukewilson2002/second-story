import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Item" };

/** PLACEHOLDER from the foundation. The inventory feature replaces this page. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await params;
  return (
    <Placeholder
      title="Item"
      owner="inventory"
      breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Item" }]}
    />
  );
}
