import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "New listing" };

/** PLACEHOLDER from the foundation. The listings-sales feature replaces this page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ items?: string }> }) {
  await requireUser();
  // ?items=id,id preselects inventory items (inventory bulk action links here).
  await searchParams;
  return (
    <Placeholder
      title="New listing"
      owner="listings-sales"
      breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: "New" }]}
    />
  );
}
