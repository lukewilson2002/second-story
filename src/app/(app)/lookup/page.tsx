import type { Metadata } from "next";
import { Placeholder } from "@/components/shell/Placeholder";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Price lookup" };

/** PLACEHOLDER from the foundation. The lookup feature replaces this page. */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireUser();
  // ?q= runs a lookup straight away (item detail and quick actions link here).
  await searchParams;
  return (
    <Placeholder
      title="Price lookup"
      owner="lookup"
    />
  );
}
