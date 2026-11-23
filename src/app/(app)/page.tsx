import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Dashboard" };

/** PLACEHOLDER from the foundation. The dashboard feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Dashboard"
      owner="dashboard"
    />
  );
}
