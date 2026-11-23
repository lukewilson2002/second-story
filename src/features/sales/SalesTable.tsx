"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import {
  Button,
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  FormError,
  Input,
  SearchIcon,
  SegmentedControl,
  Tag,
  type DataTableColumn,
} from "@/components/ui";
import type { ActionResult } from "@/lib/action";
import { formatBps, formatCents, formatCount, formatDate, formatShortDate } from "@/lib/format";
import { markAllCommissionPaidAction, setCommissionPaidAction } from "./actions";
import type { SalesFilter } from "./schemas";
import type { SaleRow } from "./types";

export interface SalesTableProps {
  rows: SaleRow[];
  initialFilter: SalesFilter;
}

/** The sales screen below the page header: commission owed, the filter, search and the table. */
export function SalesTable({ rows, initialFilter }: SalesTableProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<SalesFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const owedRows = rows.filter((row) => row.commissionCents > 0 && row.commissionPaidAt === null);
  const owedCents = owedRows.reduce((sum, row) => sum + row.commissionCents, 0);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (filter === "commission-owed" && !(row.commissionCents > 0 && row.commissionPaidAt === null)) return false;
      if (needle === "") return true;
      return row.listingTitle.toLowerCase().includes(needle) || row.marketplaceName.toLowerCase().includes(needle);
    });
  }, [rows, filter, search]);

  const columns = useMemo<DataTableColumn<SaleRow>[]>(() => {
    function run(action: () => Promise<ActionResult<unknown>>) {
      startTransition(async () => {
        const result = await action();
        setError(result.ok ? null : result.error);
        if (result.ok) router.refresh();
      });
    }
    return [
      {
        id: "sold",
        header: "Sold",
        nowrap: true,
        sortValue: (row) => row.soldAt,
        cell: (row) => formatDate(row.soldAt),
      },
      {
        id: "listing",
        header: "Listing",
        sortValue: (row) => row.listingTitle,
        cell: (row) => (
          <div className="min-w-[180px]">
            <Link href={`/listings/${row.listingId}`} className="inline-flex min-h-11 items-center font-semibold text-ink">
              {row.listingTitle}
            </Link>
            {row.quantity > 1 ? <div className="-mt-2 pb-1 text-ink-muted">{formatCount(row.quantity)} units</div> : null}
          </div>
        ),
      },
      {
        id: "marketplace",
        header: "Marketplace",
        sortValue: (row) => row.marketplaceName,
        cell: (row) => <Tag>{row.marketplaceName}</Tag>,
      },
      {
        id: "revenue",
        header: "Revenue",
        numeric: true,
        nowrap: true,
        sortValue: (row) => row.revenueCents,
        cell: (row) => formatCents(row.revenueCents),
      },
      {
        id: "profit",
        header: "Profit",
        numeric: true,
        nowrap: true,
        sortValue: (row) => row.profitCents,
        cell: (row) => (
          <span className={row.profitCents < 0 ? "font-semibold text-danger" : "font-semibold text-profit"}>
            {formatCents(row.profitCents)}
          </span>
        ),
      },
      {
        id: "margin",
        header: "Margin",
        numeric: true,
        nowrap: true,
        sortValue: (row) => row.marginBps,
        cell: (row) =>
          row.marginBps === null ? <span className="text-ink-muted">None</span> : formatBps(row.marginBps, { fractionDigits: 1 }),
      },
      {
        id: "commission",
        header: "Commission",
        numeric: true,
        nowrap: true,
        sortValue: (row) => row.commissionCents,
        cell: (row) => {
          if (row.commissionCents === 0) return <span className="text-ink-muted">None</span>;
          const who = row.commissionPayee ? ` to ${row.commissionPayee}` : "";
          return (
            <span className="inline-flex items-center justify-end gap-2">
              <span>
                {formatCents(row.commissionCents)}
                {row.commissionPaidAt ? (
                  <span className="block text-ink-muted">Paid {formatShortDate(row.commissionPaidAt)}</span>
                ) : (
                  <span className="block text-ink-secondary">Owed{who}</span>
                )}
              </span>
              {row.commissionPaidAt ? (
                <Button
                  variant="ghost"
                  aria-label={`Mark commission on ${row.listingTitle} as not paid`}
                  onClick={() => run(() => setCommissionPaidAction(row.id, false))}
                >
                  Undo
                </Button>
              ) : (
                <Button
                  aria-label={`Mark commission on ${row.listingTitle} as paid`}
                  onClick={() => run(() => setCommissionPaidAction(row.id, true))}
                >
                  Mark paid
                </Button>
              )}
            </span>
          );
        },
      },
    ];
  }, [router]);

  return (
    <>
      {owedRows.length > 0 ? (
        <section
          aria-label="Commission owed"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card bg-butter px-5 py-4 text-ink-secondary"
        >
          <div>
            <div className="text-eyebrow">Commission owed</div>
            <div className="font-display text-[26px] font-bold text-ink tabular-nums">{formatCents(owedCents)}</div>
            <div>
              Across {formatCount(owedRows.length)} {owedRows.length === 1 ? "sale" : "sales"}.
            </div>
          </div>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await markAllCommissionPaidAction();
                setError(result.ok ? null : result.error);
                if (result.ok) router.refresh();
              })
            }
          >
            Mark all paid
          </Button>
        </section>
      ) : null}

      <FormError message={error} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Sales shown"
          options={[
            { value: "all", label: "All sales" },
            { value: "commission-owed", label: "Commission owed" },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <div className="relative min-w-[200px] flex-[0_1_300px]">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <SearchIcon size={16} />
          </span>
          <Input
            type="search"
            aria-label="Search sales by listing or marketplace"
            placeholder="Search sales"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <Card padding="none">
        <DataTable
          caption="Sales"
          columns={columns}
          rows={visible}
          getRowId={(row) => row.id}
          minWidth={940}
          fillHeight
          // On a phone the filters leave room for only three rows. If fewer than six fit, six are shown and the page scrolls.
          minRows={6}
          noun={["sale", "sales"]}
          initialSort={{ columnId: "sold", desc: true }}
          empty={
            rows.length === 0 ? (
              <EmptyState
                title="No sales yet"
                description="When a listing sells, mark it sold and its profit shows up here."
                action={
                  <ButtonLink href="/sales/new" variant="primary">
                    Mark sold
                  </ButtonLink>
                }
              />
            ) : filter === "commission-owed" && search.trim() === "" ? (
              <EmptyState title="No commission owed" description="Every commission has been marked paid." />
            ) : (
              <EmptyState title="No sales match" description="Try a different search, or show all sales." />
            )
          }
        />
      </Card>
    </>
  );
}
