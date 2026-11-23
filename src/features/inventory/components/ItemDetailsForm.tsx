"use client";

import { useState } from "react";
import { Button, CategoryPicker, Field, FormError, Input, Textarea } from "@/components/ui";
import type { CategoryRecord } from "@/lib/domain/categories";
import { updateItemAction } from "../actions";
import { useFormAction } from "../use-form-action";

export interface ItemDetailsFormProps {
  categories: readonly CategoryRecord[];
  item: {
    id: string;
    title: string;
    categoryId: string;
    condition: string | null;
    storageLocation: string | null;
    description: string | null;
    notes: string | null;
  };
}

/** Edits an item's own fields. Quantity and cost are not here: they change through purchases and corrections. */
export function ItemDetailsForm({ categories, item }: ItemDetailsFormProps) {
  const [saved, setSaved] = useState(false);
  const { onSubmit, pending, error, fieldErrors } = useFormAction(updateItemAction, (result) => setSaved(result.ok));
  return (
    <form onSubmit={onSubmit} onChange={() => setSaved(false)} className="flex flex-col gap-4">
      <input type="hidden" name="itemId" value={item.id} />
      <FormError message={error} />
      <Field label="Title" error={fieldErrors.title}>
        <Input name="title" defaultValue={item.title} required maxLength={500} autoComplete="off" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" error={fieldErrors.categoryId}>
          <CategoryPicker categories={categories} name="categoryId" defaultValue={item.categoryId} required />
        </Field>
        <Field label="Condition" optional error={fieldErrors.condition}>
          <Input name="condition" defaultValue={item.condition ?? ""} maxLength={200} />
        </Field>
        <Field label="Storage location" optional error={fieldErrors.storageLocation} hint="Bin or shelf.">
          <Input name="storageLocation" defaultValue={item.storageLocation ?? ""} maxLength={200} />
        </Field>
      </div>
      <Field label="Description" optional error={fieldErrors.description}>
        <Textarea name="description" defaultValue={item.description ?? ""} maxLength={5000} />
      </Field>
      <Field label="Notes" optional error={fieldErrors.notes}>
        <Textarea name="notes" defaultValue={item.notes ?? ""} maxLength={5000} />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </Button>
        <span role="status" className="font-medium text-profit">
          {saved ? "Saved" : ""}
        </span>
      </div>
    </form>
  );
}
