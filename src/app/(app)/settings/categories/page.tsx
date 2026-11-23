import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Categories" };

/** PLACEHOLDER from the foundation. The settings feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Categories"
      owner="settings"
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Categories" }]}
    />
  );
}
