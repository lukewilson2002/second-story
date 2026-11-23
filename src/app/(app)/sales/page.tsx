import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { buttonClasses, ButtonLink } from "@/components/ui";
import { SalesTable } from "@/features/sales/SalesTable";
import { loadSaleRows } from "@/features/sales/data";
import { parseSalesFilter } from "@/features/sales/schemas";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatCents, formatCount } from "@/lib/format";

export const metadata: Metadata = { title: "Sales" };

export default async function Page({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const userId = await requireUser();
  const query = await searchParams;
  const filter = parseSalesFilter(Array.isArray(query.filter) ? query.filter[0] : query.filter);
  const rows = await loadSaleRows(getDb(), userId);

  const revenueCents = rows.reduce((sum, row) => sum + row.revenueCents, 0);
  const profitCents = rows.reduce((sum, row) => sum + row.profitCents, 0);

  return (
    <>
      <PageHeader
        title="Sales"
        description={`${formatCount(rows.length)} ${rows.length === 1 ? "sale" : "sales"}, ${formatCents(revenueCents)} revenue, ${formatCents(profitCents)} profit`}
        actions={
          <>
            {/* A plain link, not next/link: the export is a file download, and prefetching it would run the query for nothing. */}
            <a href="/sales/export" download className={buttonClasses("secondary", "no-underline")}>
              Export CSV
            </a>
            <ButtonLink href="/sales/new" variant="primary">
              Mark sold
            </ButtonLink>
          </>
        }
      />
      <SalesTable key={filter} rows={rows} initialFilter={filter} />
    </>
  );
}
