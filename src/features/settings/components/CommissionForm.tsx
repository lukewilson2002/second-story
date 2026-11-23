"use client";

import { Button, Card, Field, FormError, Input, PercentInput } from "@/components/ui";
import { saveCommissionAction } from "../actions";
import type { CommissionDefaults } from "../data";
import { NAME_MAX_LENGTH } from "../schemas";
import { useActionForm } from "./useActionForm";

/** The default commission percent and payee that new listings start with. */
export function CommissionForm({ defaults }: { defaults: CommissionDefaults }) {
  const form = useActionForm(saveCommissionAction);
  return (
    <Card className="max-w-xl">
      <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
        <FormError message={form.formError} />
        <Field
          label="Commission percent"
          optional
          error={form.fieldErrors.percent}
          hint="A share of the profit on a sale, not of the sale price. A sale that loses money pays no commission."
        >
          <PercentInput name="percent" defaultValueBps={defaults.defaultCommissionBps} />
        </Field>
        <Field label="Paid to" optional error={form.fieldErrors.payee} hint="Who earns the commission, for example a friend's name.">
          <Input name="payee" defaultValue={defaults.defaultCommissionPayee ?? ""} maxLength={NAME_MAX_LENGTH} autoComplete="off" />
        </Field>
        <p className="text-ink-muted">
          New listings start with these values, and you can change them on each listing. Listings you already have keep the
          commission they were saved with. Leave both empty if nobody earns commission.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={form.pending}>
            {form.pending ? "Saving…" : "Save"}
          </Button>
          <p role="status" className="font-medium text-profit">
            {form.saved && !form.pending ? "Saved" : ""}
          </p>
        </div>
      </form>
    </Card>
  );
}
