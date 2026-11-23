import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { Scanner } from "@/features/quick-actions/scan/Scanner";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Scan barcode" };

export default async function Page() {
  await requireUser();
  return (
    <>
      <PageHeader
        title="Scan barcode"
        description="Point the camera at a UPC, EAN or ISBN barcode. Add item opens with the number filled in."
      />
      <Scanner />
    </>
  );
}
