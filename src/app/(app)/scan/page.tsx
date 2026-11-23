import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Scan barcode" };

/** PLACEHOLDER from the foundation. The dashboard feature replaces this page. */
export default async function Page() {
  await requireUser();
  return (
    <Placeholder
      title="Scan barcode"
      owner="dashboard"
      detail="The dashboard feature builds the camera scanner here. It redirects to /inventory/new with the identifier filled in."
    />
  );
}
