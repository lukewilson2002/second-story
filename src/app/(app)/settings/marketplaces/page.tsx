import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Marketplaces and fee rules" };

/** PLACEHOLDER from the foundation. The settings feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Marketplaces and fee rules"
      owner="settings"
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Marketplaces" }]}
    />
  );
}
