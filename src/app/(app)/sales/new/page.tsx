import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Mark sold" };

/** PLACEHOLDER from the foundation. The listings-sales feature replaces this page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ listing?: string }> }) {
  await requireUser();
  // ?listing=id preselects the listing that sold.
  await searchParams;
  return (
    <Placeholder
      title="Mark sold"
      owner="listings-sales"
      breadcrumbs={[{ label: "Sales", href: "/sales" }, { label: "Mark sold" }]}
    />
  );
}
