"use client";

import { useState } from "react";
import { Button, Field, FormError, Input, PlusIcon } from "@/components/ui";
import { formatCents, formatCount, formatDate } from "@/lib/format";
import { correctQuantityAction } from "../actions";
import { useFormAction } from "../use-form-action";
import { AddStockDialog } from "./AddStockDialog";

export interface ItemStockProps {
  item: { id: string; title: string; quantityOnHand: number; avgUnitCostCents: number };
  purchases: readonly { id: string; purchasedAt: string; quantity: number; unitCostCents: number; source: string | null }[];
  today: string;
}

/** Purchase history with "Add stock", and the manual quantity correction. */
export function ItemStock({ item, purchases, today }: ItemStockProps) {
  const [adding, setAdding] = useState(false);
  const [corrected, setCorrected] = useState(false);
  const { onSubmit, pending, error, fieldErrors } = useFormAction(correctQuantityAction, (result) => setCorrected(result.ok));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto" role="region" aria-label="Purchase history table" tabIndex={0}>
        <table className="w-full min-w-[480px] border-collapse tabular-nums">
          <caption className="visually-hidden">Purchase history</caption>
          <thead>
            <tr className="text-left text-[12px] text-ink-muted">
              <th scope="col" className="py-2 pr-2 font-semibold">
                Date
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Qty
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Unit cost
              </th>
              <th scope="col" className="px-2 py-2 text-right font-semibold">
                Total
              </th>
              <th scope="col" className="py-2 pl-2 font-semibold">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {purchases.map((purchase) => (
              <tr key={purchase.id} className="border-t border-border">
                <td className="py-2.5 pr-2 whitespace-nowrap">{formatDate(purchase.purchasedAt)}</td>
                <td className="px-2 py-2.5 text-right">{formatCount(purchase.quantity)}</td>
                <td className="px-2 py-2.5 text-right">{formatCents(purchase.unitCostCents)}</td>
                <td className="px-2 py-2.5 text-right">{formatCents(purchase.quantity * purchase.unitCostCents)}</td>
                <td className="py-2.5 pl-2 text-ink-secondary">{purchase.source ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div>
        <Button icon={<PlusIcon size={16} />} onClick={() => setAdding(true)}>
          Add stock
        </Button>
      </div>

      <form
        // The key resets the field to the new quantity after a sale, a purchase or a correction changes it.
        key={item.quantityOnHand}
        onSubmit={onSubmit}
        onChange={() => setCorrected(false)}
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <input type="hidden" name="itemId" value={item.id} />
        <FormError message={error && !fieldErrors.quantity ? error : null} />
        <div className="flex flex-wrap items-end gap-3">
          <Field
            label="Quantity on hand"
            className="w-40"
            error={fieldErrors.quantity}
          >
            <Input name="quantity" inputMode="numeric" autoComplete="off" defaultValue={item.quantityOnHand} required className="tabular-nums" />
          </Field>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Correct quantity"}
          </Button>
          <span role="status" className="flex min-h-11 items-center font-medium text-profit">
            {corrected ? "Updated" : ""}
          </span>
        </div>
        <p className="text-[13px] text-ink-muted">
          For corrections, such as a lost or damaged unit. It changes the count only. No purchase is recorded and the average
          cost stays the same. To record a new buy, use Add stock.
        </p>
      </form>

      <AddStockDialog
        item={adding ? { id: item.id, title: item.title, avgUnitCostCents: item.avgUnitCostCents } : null}
        today={today}
        onClose={() => setAdding(false)}
      />
    </div>
  );
}
