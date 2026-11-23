import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { ButtonLink, PlusIcon } from "@/components/ui";
import { ListingsTable } from "@/features/listings/ListingsTable";
import { loadListingRows } from "@/features/listings/data";
import { parseListingsQuery } from "@/features/listings/schemas";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatCents, formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Listings" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string | string[]; filter?: string | string[] }>;
}) {
  const userId = await requireUser();
  const query = await searchParams;
  const { tab, filter } = parseListingsQuery({ tab: first(query.tab), filter: first(query.filter) });
  const rows = await loadListingRows(getDb(), userId);

  const active = rows.filter((row) => row.status === "active");
  const askingTotalCents = active.reduce(
    (sum, row) => sum + row.askingPriceCents * Math.max(0, row.quantity - row.soldQuantity),
    0,
  );

  return (
    <>
      <PageHeader
        title="Listings"
        description={`${formatCount(active.length)} active ${active.length === 1 ? "listing" : "listings"}, ${formatCents(askingTotalCents)} asking`}
        actions={
          <>
            <ButtonLink href="/sales/new">Mark sold</ButtonLink>
            <ButtonLink href="/listings/new" variant="primary" icon={<PlusIcon size={16} />}>
              New listing
            </ButtonLink>
          </>
        }
      />
      {/* The key resets the search box when the tab or filter changes. */}
      <ListingsTable key={`${tab}:${filter ?? ""}`} rows={rows} tab={tab} filter={filter} />
    </>
  );
}
