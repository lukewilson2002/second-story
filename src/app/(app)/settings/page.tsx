import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

/** PLACEHOLDER from the foundation. The settings feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Settings"
      owner="settings"
    />
  );
}
