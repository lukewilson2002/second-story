"use client";

import { useId } from "react";
import { Button, Dialog, FormError } from "@/components/ui";
import { addStockAction } from "../actions";
import { useFormAction } from "../use-form-action";
import { PurchaseFields } from "./PurchaseFields";

export interface AddStockTarget {
  id: string;
  title: string;
  /** Prefills the cost with what the item cost last time. */
  avgUnitCostCents: number | null;
}

/**
 * Records another purchase of an existing item.
 * Render it always and pass the item to open it, or null to close it.
 */
export function AddStockDialog({ item, today, onClose }: { item: AddStockTarget | null; today: string; onClose: () => void }) {
  const formId = useId();
  const { onSubmit, pending, error, fieldErrors, clear } = useFormAction(addStockAction, (result) => {
    if (result.ok) close();
  });
  function close() {
    clear();
    onClose();
  }
  return (
    <Dialog
      open={item !== null}
      onClose={close}
      title="Add stock"
      description={item ? `Record another purchase of "${item.title}".` : undefined}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" disabled={pending}>
            {pending ? "Saving…" : "Add stock"}
          </Button>
        </>
      }
    >
      {item ? (
        // The key gives each item a fresh form, because the money field keeps its own text.
        <form id={formId} key={item.id} onSubmit={onSubmit} className="flex flex-col gap-4">
          <input type="hidden" name="itemId" value={item.id} />
          <FormError message={error} />
          <PurchaseFields fieldErrors={fieldErrors} today={today} defaultUnitCostCents={item.avgUnitCostCents} />
        </form>
      ) : null}
    </Dialog>
  );
}
