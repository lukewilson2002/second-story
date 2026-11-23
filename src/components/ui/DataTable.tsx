"use client";

import {
  createPaginatedRowModel,
  createSortedRowModel,
  rowPaginationFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type ColumnDef,
  type PaginationState,
  type RowData,
  type SortingState,
} from "@tanstack/react-table";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatCount } from "@/lib/format";
import { Button } from "./Button";
import { ChevronDownIcon, ChevronUpIcon } from "./icons";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
});

type SortValue = string | number | null | undefined;

export interface DataTableColumn<T> {
  /** Unique within the table. Used for sorting state and React keys. */
  id: string;
  /** Header text. */
  header: string;
  /** Renders the cell. */
  cell: (row: T) => ReactNode;
  /**
   * Makes the column sortable. Return the value to sort by: a number, or a string (compared without case).
   * Rows that return null or undefined always sort last.
   */
  sortValue?: (row: T) => SortValue;
  /** Right-aligns the column and uses tabular numerals. Set it for money, counts and days. */
  numeric?: boolean;
  /** Stops the cell text from wrapping. */
  nowrap?: boolean;
  /** Extra classes for the body cells, for example "text-ink-secondary". */
  className?: string;
}

export interface DataTableProps<T extends RowData> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  getRowId: (row: T) => string;
  /** Names the table for screen readers, for example "Inventory". It is not shown. */
  caption: string;
  /** Narrower than this, the table scrolls sideways inside its card. Default 640. */
  minWidth?: number;
  initialSort?: { columnId: string; desc?: boolean };
  /** Rows per page when `fillHeight` is off. Default 25. */
  pageSize?: number;
  /**
   * Fill the window height: the number of rows per page follows the space between the table and the bottom of the window,
   * so no blank area is left below it and the page itself does not need to scroll.
   * Use it for a table that is the last thing on its page.
   */
  fillHeight?: boolean;
  /** The fewest rows `fillHeight` will show, however short the window is. Default 3. */
  minRows?: number;
  /** Adds a checkbox column. Pair it with `selectedIds` and `onSelectedIdsChange`. */
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: Set<string>) => void;
  /** For the checkbox labels: "Select {name}". */
  getRowLabel?: (row: T) => string;
  /** Shown instead of the table body when there are no rows. Usually an EmptyState. */
  empty?: ReactNode;
  /** Singular and plural, for "Showing 8 of 96 items". Default ["row", "rows"]. */
  noun?: readonly [singular: string, plural: string];
  className?: string;
}

/** Ascending comparison. TanStack reverses it for descending and places null and undefined itself (`sortUndefined`). */
function compareValues(a: SortValue, b: SortValue): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "en", { sensitivity: "base", numeric: true });
}

function toSortValue(value: unknown): SortValue {
  return typeof value === "number" || typeof value === "string" ? value : undefined;
}

const DEFAULT_ROW_HEIGHT = 61;

/**
 * The shared table: sorting, paging, right-aligned numeric columns, optional row selection, and sideways scroll on narrow screens.
 * It wraps TanStack Table so features only describe columns.
 *
 * `columns` holds functions, so the component that renders a DataTable must itself be a Client Component.
 * Define `columns` outside the component or in useMemo. A new array on every render resets the table's work.
 * Render it inside `<Card padding="none">`.
 */
export function DataTable<T extends RowData>({
  columns,
  rows,
  getRowId,
  caption,
  minWidth = 640,
  initialSort,
  pageSize = 25,
  fillHeight = false,
  minRows = 3,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  getRowLabel,
  empty,
  noun = ["row", "rows"],
  className,
}: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(
    initialSort ? [{ id: initialSort.columnId, desc: initialSort.desc ?? false }] : [],
  );
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize });

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));
  // Filtering can leave the stored page past the end, so the page shown is clamped to the last one.
  const pageIndex = Math.min(pagination.pageIndex, pageCount - 1);

  const columnDefs = useMemo<ColumnDef<typeof features, T>[]>(
    () =>
      columns.map((column) => ({
        id: column.id,
        header: column.header,
        accessorFn: (row: T) => (column.sortValue ? (column.sortValue(row) ?? undefined) : undefined),
        enableSorting: Boolean(column.sortValue),
        sortUndefined: "last" as const,
        // TanStack sorts numbers descending first by default. Every column here starts ascending.
        sortDescFirst: false,
        sortFn: (a, b, columnId) => compareValues(toSortValue(a.getValue(columnId)), toSortValue(b.getValue(columnId))),
      })),
    [columns],
  );
  const data = useMemo(() => [...rows], [rows]);

  const table = useTable({
    features,
    columns: columnDefs,
    data,
    getRowId,
    state: { sorting, pagination: { pageIndex, pageSize: pagination.pageSize } },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    enableSortingRemoval: false,
    enableMultiSort: false,
  });

  const cardRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLTableSectionElement>(null);
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const gapProbeRef = useRef<HTMLDivElement>(null);
  const pageSizeRef = useRef(pageSize);

  const measure = useCallback(() => {
    const card = cardRef.current;
    if (!fillHeight || !card) return;
    const top = card.getBoundingClientRect().top + window.scrollY;
    const head = headRef.current?.getBoundingClientRect().height ?? 0;
    const footer = footerRef.current?.getBoundingClientRect().height ?? 0;
    const gap = gapProbeRef.current?.getBoundingClientRect().height ?? 0;
    const firstRow = bodyRef.current?.querySelector("tr");
    const rowHeight = firstRow?.getBoundingClientRect().height || DEFAULT_ROW_HEIGHT;
    // 2px for the card's top and bottom border.
    const available = window.innerHeight - top - gap - head - footer - 2;
    const fit = Math.max(minRows, Math.floor(available / rowHeight));
    // Setting state on every measure would loop, because each render measures again.
    if (fit === pageSizeRef.current) return;
    pageSizeRef.current = fit;
    setPagination((current) => {
      // Keep the first visible row on screen when the page size changes.
      const firstVisible = current.pageIndex * current.pageSize;
      return { pageIndex: Math.floor(firstVisible / fit), pageSize: fit };
    });
  }, [fillHeight, minRows]);

  useLayoutEffect(() => {
    measure();
  }, [measure, rows.length, pagination.pageSize]);

  useEffect(() => {
    if (!fillHeight) return;
    window.addEventListener("resize", measure);
    // Filters above the table can wrap onto a second line, which moves the table down.
    const observer = new ResizeObserver(measure);
    if (cardRef.current?.parentElement) observer.observe(cardRef.current.parentElement);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [fillHeight, measure]);

  const pageRows = table.getRowModel().rows;

  const columnById = useMemo(() => new Map(columns.map((column) => [column.id, column])), [columns]);
  const selected = selectedIds ?? new Set<string>();
  const allSelected = total > 0 && rows.every((row) => selected.has(getRowId(row)));
  const someSelected = !allSelected && rows.some((row) => selected.has(getRowId(row)));
  const toggleAll = () => onSelectedIdsChange?.(allSelected ? new Set() : new Set(rows.map(getRowId)));
  const toggleRow = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange?.(next);
  };

  const firstShown = total === 0 ? 0 : pageIndex * pagination.pageSize + 1;
  const lastShown = Math.min(total, (pageIndex + 1) * pagination.pageSize);
  const summary =
    total === 0
      ? `No ${noun[1]}`
      : pageCount === 1
        ? `${formatCount(total)} ${total === 1 ? noun[0] : noun[1]}`
        : `Showing ${formatCount(firstShown)} to ${formatCount(lastShown)} of ${formatCount(total)} ${noun[1]}`;

  return (
    <div ref={cardRef} className={cn("min-w-0", className)}>
      {fillHeight ? (
        <div ref={gapProbeRef} aria-hidden="true" className="invisible absolute h-(--shell-bottom-gap) w-px" />
      ) : null}
      <div className="overflow-x-auto" role="region" aria-label={`${caption} table`} tabIndex={0}>
        <table className="w-full border-collapse tabular-nums" style={{ minWidth }}>
          <caption className="visually-hidden">{caption}</caption>
          <thead ref={headRef}>
            <tr className="text-left text-[12px] text-ink-muted">
              {selectable ? (
                <th scope="col" className="w-11 py-1 pr-0 pl-2">
                  <label className="flex size-11 cursor-pointer items-center justify-center">
                    <span className="visually-hidden">Select all {noun[1]}</span>
                    <input
                      type="checkbox"
                      className="size-[18px] cursor-pointer accent-primary"
                      checked={allSelected}
                      ref={(element) => {
                        if (element) element.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                    />
                  </label>
                </th>
              ) : null}
              {table.getHeaderGroups().flatMap((group) =>
                group.headers.map((header, index) => {
                  const column = columnById.get(header.column.id);
                  const sortable = header.column.getCanSort();
                  const direction = header.column.getIsSorted();
                  const edge = cn(
                    index === 0 && !selectable && "pl-5",
                    index === group.headers.length - 1 && "pr-5",
                  );
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : undefined}
                      className={cn("px-2 py-1 font-semibold", column?.numeric && "text-right", edge)}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-inner font-semibold whitespace-nowrap hover:text-ink",
                            direction && "text-ink",
                          )}
                        >
                          {column?.numeric ? null : column?.header}
                          {direction === "desc" ? (
                            <ChevronDownIcon size={12} />
                          ) : (
                            <ChevronUpIcon size={12} className={direction ? undefined : "opacity-0"} />
                          )}
                          {/* On a right-aligned column the arrow goes first, so the label lines up with the numbers. */}
                          {column?.numeric ? column.header : null}
                        </button>
                      ) : (
                        <span className="inline-flex min-h-11 items-center whitespace-nowrap">{column?.header}</span>
                      )}
                    </th>
                  );
                }),
              )}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {pageRows.map((row) => (
              <tr key={row.id} className={cn("border-t border-border", selected.has(row.id) && "bg-ground")}>
                {selectable ? (
                  <td className="w-11 py-1 pr-0 pl-2">
                    <label className="flex size-11 cursor-pointer items-center justify-center">
                      <span className="visually-hidden">Select {getRowLabel?.(row.original) ?? noun[0]}</span>
                      <input
                        type="checkbox"
                        className="size-[18px] cursor-pointer accent-primary"
                        checked={selected.has(row.id)}
                        onChange={() => toggleRow(row.id)}
                      />
                    </label>
                  </td>
                ) : null}
                {columns.map((column, index) => (
                  <td
                    key={column.id}
                    className={cn(
                      "px-2 py-2.5",
                      column.numeric && "text-right",
                      column.nowrap && "whitespace-nowrap",
                      index === 0 && !selectable && "pl-5",
                      index === columns.length - 1 && "pr-5",
                      column.className,
                    )}
                  >
                    {column.cell(row.original)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total === 0 && empty ? <div className="border-t border-border">{empty}</div> : null}
      <div
        ref={footerRef}
        className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 text-ink-muted"
      >
        <span aria-live="polite">{summary}</span>
        {pageCount > 1 ? (
          <>
            <Button
              className="font-medium"
              disabled={pageIndex === 0}
              onClick={() => setPagination((current) => ({ ...current, pageIndex: pageIndex - 1 }))}
            >
              Previous
            </Button>
            <Button
              className="font-medium"
              disabled={pageIndex >= pageCount - 1}
              onClick={() => setPagination((current) => ({ ...current, pageIndex: pageIndex + 1 }))}
            >
              Next
            </Button>
          </>
        ) : null}
      </div>
    </div>
  );
}
