import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Inventory" };

/** PLACEHOLDER from the foundation. The inventory feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Inventory"
      owner="inventory"
    />
  );
}
