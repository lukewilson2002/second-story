"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ButtonLink,
  Card,
  DataTable,
  EmptyState,
  Input,
  ListingStatusPill,
  Pill,
  SearchIcon,
  Tabs,
  Tag,
  type DataTableColumn,
} from "@/components/ui";
import { formatCents, formatCount } from "@/lib/format";
import type { ListingFilter, ListingTab } from "./schemas";
import type { ListingRow } from "./types";
import { filterListingRows, LISTING_FILTER_LABELS } from "./view";

const TAB_LABELS: Record<ListingTab, string> = { active: "Active", sold: "Sold", ended: "Ended", draft: "Drafts" };
const TAB_ORDER: readonly ListingTab[] = ["active", "sold", "ended", "draft"];

const EMPTY_TEXT: Record<ListingTab, { title: string; description: string }> = {
  active: { title: "No active listings", description: "Publish a listing to track it here." },
  sold: { title: "Nothing sold yet", description: "A listing moves here when its last unit sells." },
  ended: { title: "No ended listings", description: "Listings you take down without a sale show up here." },
  draft: { title: "No drafts", description: "Save a listing as a draft to finish it later." },
};

const columns: DataTableColumn<ListingRow>[] = [
  {
    id: "title",
    header: "Listing",
    sortValue: (row) => row.title,
    cell: (row) => (
      <div className="min-w-[200px]">
        <Link href={`/listings/${row.id}`} className="inline-flex min-h-11 items-center font-semibold text-ink">
          {row.title}
        </Link>
        {row.quantity > 1 ? (
          <div className="-mt-2 pb-1 text-ink-muted">
            {formatCount(row.soldQuantity)} of {formatCount(row.quantity)} sold
          </div>
        ) : null}
      </div>
    ),
  },
  {
    id: "marketplaces",
    header: "Marketplaces",
    sortValue: (row) => row.marketplaces.map((marketplace) => marketplace.name).join(", ") || null,
    cell: (row) =>
      row.marketplaces.length === 0 ? (
        <span className="text-ink-muted">None yet</span>
      ) : (
        <span className="flex flex-wrap gap-1.5">
          {row.marketplaces.map((marketplace) => (
            <Tag key={marketplace.marketplaceId} className={marketplace.status === "ended" ? "line-through" : ""}>
              {marketplace.name}
              {marketplace.status === "ended" ? <span className="visually-hidden"> (taken down)</span> : null}
            </Tag>
          ))}
        </span>
      ),
  },
  {
    id: "asking",
    header: "Asking price",
    numeric: true,
    nowrap: true,
    sortValue: (row) => row.askingPriceCents,
    cell: (row) => formatCents(row.askingPriceCents),
  },
  {
    id: "minimum",
    header: "Minimum price",
    numeric: true,
    nowrap: true,
    sortValue: (row) => row.minimumPriceCents,
    cell: (row) => (
      <span className="inline-flex items-center justify-end gap-2">
        {row.belowMinimum && row.marketplaces.length > 0 ? <Pill tone="peach">Below minimum</Pill> : null}
        {row.minimumPriceCents === null ? <span className="text-ink-muted">None</span> : formatCents(row.minimumPriceCents)}
      </span>
    ),
  },
  {
    id: "days",
    header: "Days listed",
    numeric: true,
    sortValue: (row) => row.daysListed,
    cell: (row) => (row.daysListed === null ? <span className="text-ink-muted">Not listed</span> : formatCount(row.daysListed)),
  },
  {
    id: "status",
    header: "Status",
    nowrap: true,
    sortValue: (row) => row.status,
    cell: (row) => (
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <ListingStatusPill status={row.status} />
        {row.stillUpCount > 0 ? <Pill tone="butter">Still up on {formatCount(row.stillUpCount)}</Pill> : null}
        {row.stale ? <Pill tone="pink">Stale</Pill> : null}
      </span>
    ),
  },
];

export interface ListingsTableProps {
  rows: ListingRow[];
  tab: ListingTab;
  filter: ListingFilter | null;
}

/** The listings screen below the page header: tabs, the needs-attention filter, search and the table. */
export function ListingsTable({ rows, tab, filter }: ListingsTableProps) {
  const [search, setSearch] = useState("");
  const counts = useMemo(() => {
    const result: Record<ListingTab, number> = { active: 0, sold: 0, ended: 0, draft: 0 };
    for (const row of rows) result[row.status] += 1;
    return result;
  }, [rows]);
  const visible = useMemo(() => filterListingRows(rows, { tab, filter, search }), [rows, tab, filter, search]);
  const empty = EMPTY_TEXT[tab];

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          label="Listing status"
          items={TAB_ORDER.map((value) => ({
            href: value === "active" ? "/listings" : `/listings?tab=${value}`,
            label: TAB_LABELS[value],
            count: counts[value],
            current: value === tab && filter === null,
          }))}
        />
        <div className="relative min-w-[200px] flex-[0_1_300px]">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <SearchIcon size={16} />
          </span>
          <Input
            type="search"
            aria-label="Search listings by title or marketplace"
            placeholder="Search listings"
            className="pl-9"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {filter ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card bg-butter px-4 py-1.5 text-ink-secondary">
          <span className="font-semibold">Showing: {LISTING_FILTER_LABELS[filter]}</span>
          <Link
            href={tab === "active" ? "/listings" : `/listings?tab=${tab}`}
            className="inline-flex min-h-11 items-center font-semibold text-ink underline"
          >
            Show all {TAB_LABELS[tab].toLowerCase()}
          </Link>
        </div>
      ) : null}

      <Card padding="none">
        <DataTable
          caption={`${TAB_LABELS[tab]} listings`}
          columns={columns}
          rows={visible}
          getRowId={(row) => row.id}
          minWidth={860}
          fillHeight
          // On a phone the filters leave room for only three rows. If fewer than six fit, six are shown and the page scrolls.
          minRows={6}
          noun={["listing", "listings"]}
          initialSort={{ columnId: "days", desc: tab === "active" }}
          empty={
            search.trim() !== "" || filter ? (
              <EmptyState title="No listings match" description="Try a different search, or clear the filter." />
            ) : (
              <EmptyState
                title={empty.title}
                description={empty.description}
                action={
                  <ButtonLink href="/listings/new" variant="primary">
                    New listing
                  </ButtonLink>
                }
              />
            )
          }
        />
      </Card>
    </>
  );
}
