import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { MarkSoldForm } from "@/features/sales/MarkSoldForm";
import { loadSellableListings } from "@/features/sales/data";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIsoDate } from "@/lib/format";

export const metadata: Metadata = { title: "Mark sold" };

export default async function Page({ searchParams }: { searchParams: Promise<{ listing?: string | string[] }> }) {
  const userId = await requireUser();
  const query = await searchParams;
  const requested = Array.isArray(query.listing) ? query.listing[0] : query.listing;
  const listings = await loadSellableListings(getDb(), userId);

  return (
    <>
      <PageHeader title="Mark sold" breadcrumbs={[{ label: "Sales", href: "/sales" }, { label: "Mark sold" }]} />
      <MarkSoldForm key={requested ?? ""} listings={listings} initialListingId={requested ?? null} today={todayIsoDate()} />
    </>
  );
}
