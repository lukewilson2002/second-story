"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState } from "react";
import {
  Button,
  ButtonLink,
  Card,
  CategoryPicker,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  FormError,
  ItemStatusPill,
  ItemThumbnail,
  SearchIcon,
  SegmentedControl,
  type DataTableColumn,
  type SegmentOption,
} from "@/components/ui";
import { categoryWithDescendantIds, type CategoryRecord } from "@/lib/domain/categories";
import { formatCents, formatCount, formatDate } from "@/lib/format";
import { ITEM_STATUS_LABELS, type ItemStatus } from "@/lib/schemas";
import { changeCategoryAction } from "../actions";
import { filterInventoryRows, type InventoryRow } from "../logic";
import { useFormAction } from "../use-form-action";
import { AddStockDialog, type AddStockTarget } from "./AddStockDialog";

type StatusFilter = ItemStatus | "all";

const STATUS_OPTIONS: readonly SegmentOption<StatusFilter>[] = [
  { value: "all", label: "All" },
  { value: "in_stock", label: ITEM_STATUS_LABELS.in_stock },
  { value: "listed", label: ITEM_STATUS_LABELS.listed },
  { value: "sold_out", label: ITEM_STATUS_LABELS.sold_out },
];

export interface InventoryTableProps {
  rows: readonly InventoryRow[];
  categories: readonly CategoryRecord[];
  today: string;
  initialQuery: string;
  initialStatus: StatusFilter;
  initialCategoryId: string;
}

/** The inventory screen below the page header: search, filters, bulk actions and the table. */
export function InventoryTable({ rows, categories, today, initialQuery, initialStatus, initialCategoryId }: InventoryTableProps) {
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [stockTarget, setStockTarget] = useState<AddStockTarget | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);

  // The filters live in the URL, so coming back from an item page or reloading keeps them.
  // The write waits for a pause in typing, because Safari throws if the URL is replaced more than 100 times in 30 seconds.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams();
      if (query.trim() !== "") params.set("q", query.trim());
      if (categoryId !== "") params.set("category", categoryId);
      if (status !== "all") params.set("status", status);
      const search = params.toString();
      try {
        window.history.replaceState(null, "", search ? `/inventory?${search}` : "/inventory");
      } catch {
        // The URL is a convenience. The filters still work without it.
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, categoryId, status]);

  const visibleRows = useMemo(
    () =>
      filterInventoryRows(rows, {
        query,
        status,
        categoryIds: categoryId === "" ? null : new Set(categoryWithDescendantIds(categoryId, categories)),
      }),
    [rows, categories, query, status, categoryId],
  );

  // A selected item can drop out of the table when a filter changes or a row is removed. Bulk actions only use ones still shown.
  const selected = useMemo(() => visibleRows.filter((row) => selectedIds.has(row.id)), [visibleRows, selectedIds]);
  const hasSelection = selected.length > 0;

  // The selection bar can wrap onto another line on a narrow screen, which moves the table down.
  // DataTable re-measures its rows per page on a resize event.
  useEffect(() => {
    window.dispatchEvent(new Event("resize"));
  }, [hasSelection]);

  const columns = useMemo<DataTableColumn<InventoryRow>[]>(
    () => [
      {
        id: "item",
        header: "Item",
        sortValue: (row) => row.title,
        cell: (row) => (
          <div className="flex items-center gap-3">
            <ItemThumbnail imageUrl={row.thumbnailUrl} categoryName={row.categoryName} toneKey={row.toneKey} />
            <Link
              href={`/inventory/${row.id}`}
              className="inline-flex min-h-11 items-center font-semibold text-ink no-underline hover:underline"
            >
              {row.title}
            </Link>
          </div>
        ),
      },
      {
        id: "category",
        header: "Category",
        nowrap: true,
        className: "text-ink-secondary",
        sortValue: (row) => row.categoryPath,
        cell: (row) => row.categoryPath,
      },
      { id: "quantity", header: "Qty", numeric: true, sortValue: (row) => row.quantity, cell: (row) => formatCount(row.quantity) },
      {
        id: "cost",
        header: "Avg unit cost",
        numeric: true,
        sortValue: (row) => row.avgUnitCostCents,
        cell: (row) => formatCents(row.avgUnitCostCents),
      },
      {
        id: "lastPurchased",
        header: "Last purchased",
        nowrap: true,
        className: "text-ink-secondary",
        sortValue: (row) => row.lastPurchasedAt,
        cell: (row) => formatDate(row.lastPurchasedAt) || "–",
      },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => ITEM_STATUS_LABELS[row.status],
        cell: (row) => <ItemStatusPill status={row.status} />,
      },
      {
        id: "daysHeld",
        header: "Days held",
        numeric: true,
        sortValue: (row) => row.daysHeld,
        cell: (row) => (row.daysHeld === null ? "–" : formatCount(row.daysHeld)),
      },
      {
        id: "stock",
        header: "Stock",
        numeric: true,
        cell: (row) => (
          <Button
            aria-label={`Add stock to ${row.title}`}
            onClick={() => setStockTarget({ id: row.id, title: row.title, avgUnitCostCents: row.avgUnitCostCents })}
          >
            Add stock
          </Button>
        ),
      },
    ],
    [],
  );

  const filtered = query.trim() !== "" || status !== "all" || categoryId !== "";

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex min-h-11 flex-[1_1_280px] items-center gap-2 rounded-control border border-border-input bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary">
          <span className="text-ink-muted">
            <SearchIcon size={16} />
          </span>
          <span className="visually-hidden">Search inventory</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by title, UPC or ISBN"
            className="min-h-11 min-w-0 flex-1 border-0 bg-transparent text-[14px] text-ink outline-none placeholder:text-ink-muted"
          />
        </label>
        <label className="flex items-center gap-2 font-medium text-ink-muted">
          Category
          {/* The shared select is full width, so the wrapper sets how wide it is here. */}
          <span className="block w-44">
            <CategoryPicker categories={categories} value={categoryId} onValueChange={setCategoryId} emptyLabel="All categories" />
          </span>
        </label>
        <SegmentedControl label="Status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </div>

      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-2" role="group" aria-label="Bulk actions">
        {hasSelection ? (
          <>
            <span className="font-medium" aria-live="polite">
              {formatCount(selected.length)} selected
            </span>
            <ButtonLink href={`/listings/new?items=${selected.map((row) => row.id).join(",")}`} variant="primary">
              Create listing
            </ButtonLink>
            <Button onClick={() => setCategoryDialogOpen(true)}>Change category</Button>
            <Button variant="ghost" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
          </>
        ) : (
          <span className="text-ink-muted">Select items to create a listing from them or change their category.</span>
        )}
      </div>

      <Card padding="none">
        <DataTable
          caption="Inventory"
          columns={columns}
          rows={visibleRows}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.title}
          minWidth={960}
          fillHeight
          // On a phone the filters leave room for only three rows. If fewer than six fit, six are shown and the page scrolls.
          minRows={6}
          selectable
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          noun={["item", "items"]}
          empty={
            filtered ? (
              <EmptyState
                title="No items match"
                description="Try a different search, category or status."
                action={
                  <Button
                    onClick={() => {
                      setQuery("");
                      setStatus("all");
                      setCategoryId("");
                    }}
                  >
                    Clear filters
                  </Button>
                }
              />
            ) : (
              <EmptyState
                title="No inventory yet"
                description="Add your first item, or import the spreadsheet you already keep."
                action={
                  <div className="flex flex-wrap justify-center gap-2">
                    <ButtonLink href="/inventory/new" variant="primary">
                      Add item
                    </ButtonLink>
                    <ButtonLink href="/inventory/import">Import CSV</ButtonLink>
                  </div>
                }
              />
            )
          }
        />
      </Card>

      <AddStockDialog item={stockTarget} today={today} onClose={() => setStockTarget(null)} />
      <ChangeCategoryDialog
        open={categoryDialogOpen}
        itemIds={selected.map((row) => row.id)}
        categories={categories}
        onClose={() => setCategoryDialogOpen(false)}
        onDone={() => {
          setCategoryDialogOpen(false);
          setSelectedIds(new Set());
        }}
      />
    </>
  );
}

function ChangeCategoryDialog({
  open,
  itemIds,
  categories,
  onClose,
  onDone,
}: {
  open: boolean;
  itemIds: readonly string[];
  categories: readonly CategoryRecord[];
  onClose: () => void;
  onDone: () => void;
}) {
  const formId = useId();
  const { onSubmit, pending, error, fieldErrors, clear } = useFormAction(changeCategoryAction, (result) => {
    if (result.ok) onDone();
  });
  const count = itemIds.length;
  return (
    <Dialog
      open={open}
      onClose={() => {
        clear();
        onClose();
      }}
      title="Change category"
      description={`Move ${formatCount(count)} ${count === 1 ? "item" : "items"} to another category.`}
      footer={
        <>
          <Button
            onClick={() => {
              clear();
              onClose();
            }}
          >
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={pending || count === 0}>
            {pending ? "Saving…" : "Change category"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="itemIds" value={JSON.stringify(itemIds)} />
        <FormError message={error ?? fieldErrors.itemIds?.[0]} />
        <Field label="New category" error={fieldErrors.categoryId}>
          <CategoryPicker categories={categories} name="categoryId" emptyLabel="Choose a category" required />
        </Field>
      </form>
    </Dialog>
  );
}
