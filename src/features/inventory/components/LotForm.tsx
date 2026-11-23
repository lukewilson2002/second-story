"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button, ButtonLink, Card, CardTitle, CategoryPicker, Field, FormError, IconButton, Input, MoneyInput, PlusIcon, TrashIcon } from "@/components/ui";
import type { CategoryRecord } from "@/lib/domain/categories";
import { formatCents } from "@/lib/format";
import { createLotAction } from "../actions";
import { lotUnitCosts } from "../logic";
import { MAX_LOT_LINES } from "../schemas";
import { useFormAction } from "../use-form-action";

interface Line {
  key: number;
  title: string;
  categoryId: string;
}

/**
 * Lot entry: several different items bought for one price.
 * Each line becomes its own item with a quantity of one. The price is split evenly and the leftover cents go to the first line.
 * The cost next to each line is the same split the server will save.
 */
export function LotForm({ categories, today }: { categories: readonly CategoryRecord[]; today: string }) {
  const router = useRouter();
  const nextKey = useRef(2);
  const [lines, setLines] = useState<Line[]>([
    { key: 0, title: "", categoryId: "" },
    { key: 1, title: "", categoryId: "" },
  ]);
  const [focusKey, setFocusKey] = useState<number | null>(null);
  const [totalCents, setTotalCents] = useState<number | null>(null);
  const { onSubmit, pending, error, fieldErrors } = useFormAction(createLotAction, (result) => {
    if (result.ok) router.push("/inventory");
  });

  const update = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const addLine = () => {
    if (lines.length >= MAX_LOT_LINES) return;
    const key = nextKey.current++;
    // A lot is often all one category, so a new line starts with the category of the line above it.
    setLines((current) => [...current, { key, title: "", categoryId: current.at(-1)?.categoryId ?? "" }]);
    setFocusKey(key);
  };

  const costs = totalCents === null ? null : lotUnitCosts(totalCents, lines.length);
  const lineError = (index: number, field: "title" | "categoryId") => fieldErrors[`lines.${index}.${field}`]?.[0];

  return (
    <form onSubmit={onSubmit} className="flex max-w-3xl flex-col gap-5">
      <FormError message={error} />
      <input
        type="hidden"
        name="lines"
        value={JSON.stringify(lines.map(({ title, categoryId }) => ({ title, categoryId })))}
      />

      <Card className="flex flex-col gap-4">
        <CardTitle>The lot</CardTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Total paid" error={fieldErrors.totalCost} hint="One price for everything in the lot.">
            <MoneyInput name="totalCost" required onValueChange={setTotalCents} />
          </Field>
          <Field label="Purchase date" error={fieldErrors.purchasedAt}>
            <Input type="date" name="purchasedAt" defaultValue={today} max={today} required />
          </Field>
          <Field label="Source" optional error={fieldErrors.source} hint="Where it was bought.">
            <Input name="source" placeholder="Thrift store, estate sale" maxLength={200} />
          </Field>
          <Field label="Storage location" optional error={fieldErrors.storageLocation} hint="Applied to every item.">
            <Input name="storageLocation" maxLength={200} />
          </Field>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <div>
          <CardTitle>Items in the lot</CardTitle>
          <p className="mt-1 text-ink-muted">
            One line per item. The total is split evenly, and any leftover cents go to the first item.
          </p>
        </div>
        {fieldErrors.lines ? <p className="text-[13px] font-medium text-danger">{fieldErrors.lines[0]}</p> : null}
        <ol className="flex flex-col gap-3">
          {lines.map((line, index) => (
            <li key={line.key} className="flex flex-wrap items-start gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0">
              <div className="flex min-w-0 flex-[2_1_220px] flex-col gap-1">
                <Input
                  aria-label={`Item ${index + 1} title`}
                  value={line.title}
                  onChange={(event) => update(line.key, { title: event.target.value })}
                  onKeyDown={(event) => {
                    // Enter moves on to a new line, so a pile of items can be typed without the mouse.
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addLine();
                    }
                  }}
                  autoFocus={line.key === focusKey}
                  placeholder={`Item ${index + 1} title`}
                  maxLength={500}
                  invalid={Boolean(lineError(index, "title"))}
                />
                {lineError(index, "title") ? <p className="text-[13px] font-medium text-danger">{lineError(index, "title")}</p> : null}
              </div>
              <div className="flex min-w-0 flex-[1_1_160px] flex-col gap-1">
                <CategoryPicker
                  categories={categories}
                  aria-label={`Item ${index + 1} category`}
                  value={line.categoryId}
                  onValueChange={(categoryId) => update(line.key, { categoryId })}
                  emptyLabel="Choose a category"
                  invalid={Boolean(lineError(index, "categoryId"))}
                />
                {lineError(index, "categoryId") ? (
                  <p className="text-[13px] font-medium text-danger">{lineError(index, "categoryId")}</p>
                ) : null}
              </div>
              <span className="flex min-h-11 w-20 items-center justify-end tabular-nums text-ink-secondary">
                <span className="visually-hidden">Cost of item {index + 1}: </span>
                {costs ? formatCents(costs[index] ?? 0) : "–"}
              </span>
              <IconButton
                aria-label={`Remove item ${index + 1}`}
                disabled={lines.length <= 2}
                onClick={() => setLines((current) => current.filter((candidate) => candidate.key !== line.key))}
              >
                <TrashIcon size={18} />
              </IconButton>
            </li>
          ))}
        </ol>
        <div>
          <Button icon={<PlusIcon size={16} />} onClick={addLine} disabled={lines.length >= MAX_LOT_LINES}>
            Add another item
          </Button>
        </div>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : `Save ${lines.length} items`}
        </Button>
        <ButtonLink href="/inventory" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
