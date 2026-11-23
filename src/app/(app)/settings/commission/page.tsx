import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Default commission" };

/** PLACEHOLDER from the foundation. The settings feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Default commission"
      owner="settings"
      breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Commission" }]}
    />
  );
}
