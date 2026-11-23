import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sales" };

/** PLACEHOLDER from the foundation. The listings-sales feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Sales"
      owner="listings-sales"
    />
  );
}
