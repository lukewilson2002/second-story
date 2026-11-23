"use client";

import { Field, Input, MoneyInput } from "@/components/ui";

export interface PurchaseFieldsProps {
  fieldErrors: Record<string, string[]>;
  today: string;
  defaultQuantity?: number;
  defaultUnitCostCents?: number | null;
  defaultPurchasedAt?: string;
  defaultSource?: string;
  /** Changes the cost label, for example "Unit cost" on the add item form. */
  costLabel?: string;
}

/** The four fields of one purchase: quantity, unit cost, date and source. They post as `quantity`, `unitCost`, `purchasedAt` and `source`. */
export function PurchaseFields({
  fieldErrors,
  today,
  defaultQuantity = 1,
  defaultUnitCostCents,
  defaultPurchasedAt,
  defaultSource,
  costLabel = "Unit cost",
}: PurchaseFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Quantity" error={fieldErrors.quantity}>
        <Input name="quantity" inputMode="numeric" autoComplete="off" defaultValue={defaultQuantity} required className="tabular-nums" />
      </Field>
      <Field label={costLabel} error={fieldErrors.unitCost} hint="What one unit cost.">
        <MoneyInput name="unitCost" defaultValueCents={defaultUnitCostCents} required />
      </Field>
      <Field label="Purchase date" error={fieldErrors.purchasedAt}>
        <Input type="date" name="purchasedAt" defaultValue={defaultPurchasedAt ?? today} max={today} required />
      </Field>
      <Field label="Source" optional error={fieldErrors.source} hint="Where it was bought.">
        <Input name="source" defaultValue={defaultSource ?? ""} placeholder="Thrift store, estate sale" maxLength={200} />
      </Field>
    </div>
  );
}
