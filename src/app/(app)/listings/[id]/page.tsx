import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Listing" };

/** PLACEHOLDER from the foundation. The listings-sales feature replaces this page. */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  await params;
  return (
    <Placeholder
      title="Listing"
      owner="listings-sales"
      breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: "Listing" }]}
    />
  );
}
