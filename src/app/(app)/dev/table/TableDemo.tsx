"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button, Card, DataTable, ItemStatusPill, ItemThumbnail, type DataTableColumn } from "@/components/ui";
import { formatCents, formatDate } from "@/lib/format";
import type { ItemStatus } from "@/lib/schemas";

interface DemoRow {
  id: string;
  title: string;
  category: string;
  quantity: number;
  costCents: number;
  lastPurchased: string;
  status: ItemStatus;
  daysHeld: number | null;
}

const CATEGORIES = ["Book", "DVD", "Blu-ray", "VHS", "Clothing", "N64"] as const;
const STATUSES = ["in_stock", "listed", "sold_out"] as const;

const ROWS: DemoRow[] = Array.from({ length: 60 }, (_, index) => {
  const status = STATUSES[index % 3] ?? "in_stock";
  return {
    id: `row-${index + 1}`,
    title: `Demo item ${String(index + 1).padStart(2, "0")}`,
    category: CATEGORIES[index % CATEGORIES.length] ?? "Book",
    quantity: status === "sold_out" ? 0 : (index % 4) + 1,
    costCents: 75 + ((index * 137) % 1500),
    lastPurchased: `2026-${String((index % 9) + 1).padStart(2, "0")}-${String((index % 27) + 1).padStart(2, "0")}`,
    status,
    daysHeld: status === "sold_out" ? null : (index * 7) % 120,
  };
});

const COLUMNS: DataTableColumn<DemoRow>[] = [
  {
    id: "item",
    header: "Item",
    sortValue: (row) => row.title,
    cell: (row) => (
      <div className="flex items-center gap-3">
        <ItemThumbnail categoryName={row.category} />
        <span className="font-semibold">{row.title}</span>
      </div>
    ),
  },
  { id: "category", header: "Category", sortValue: (row) => row.category, nowrap: true, className: "text-ink-secondary", cell: (row) => row.category },
  { id: "quantity", header: "Qty", numeric: true, sortValue: (row) => row.quantity, cell: (row) => row.quantity },
  { id: "cost", header: "Avg unit cost", numeric: true, sortValue: (row) => row.costCents, cell: (row) => formatCents(row.costCents) },
  { id: "last", header: "Last purchased", nowrap: true, className: "text-ink-secondary", sortValue: (row) => row.lastPurchased, cell: (row) => formatDate(row.lastPurchased) },
  { id: "status", header: "Status", cell: (row) => <ItemStatusPill status={row.status} /> },
  { id: "days", header: "Days held", numeric: true, sortValue: (row) => row.daysHeld, cell: (row) => row.daysHeld ?? "–" },
];

export function TableDemo() {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  return (
    <>
      <PageHeader
        title="Table demo"
        breadcrumbs={[{ label: "Dev", href: "/dev/ui" }, { label: "Table" }]}
        description="60 rows. The rows per page follow the window height."
        actions={
          <Button disabled={selected.size === 0} data-testid="selection-count">
            {selected.size} selected
          </Button>
        }
      />
      <Card padding="none">
        <DataTable
          caption="Demo items"
          columns={COLUMNS}
          rows={ROWS}
          getRowId={(row) => row.id}
          getRowLabel={(row) => row.title}
          minWidth={880}
          fillHeight
          selectable
          selectedIds={selected}
          onSelectedIdsChange={setSelected}
          noun={["item", "items"]}
        />
      </Card>
    </>
  );
}
