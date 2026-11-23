"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button, Field, FormError, IconButton, Input, Select, TrashIcon } from "@/components/ui";
import { IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS, guessIdentifierType, identifierTypeSchema, type IdentifierType } from "@/lib/schemas";
import { addIdentifierAction, removeIdentifierAction } from "../actions";
import { useFormAction } from "../use-form-action";

export interface ItemIdentifiersProps {
  itemId: string;
  identifiers: readonly { id: string; type: IdentifierType; value: string }[];
}

/** An item's identifiers, each with a price lookup link and a remove button, and a small form to add one. */
export function ItemIdentifiers({ itemId, identifiers }: ItemIdentifiersProps) {
  const [type, setType] = useState<IdentifierType>("upc");
  const [typeChosen, setTypeChosen] = useState(false);
  const [value, setValue] = useState("");
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const { onSubmit, pending, error, fieldErrors } = useFormAction(addIdentifierAction, (result) => {
    if (result.ok) {
      setValue("");
      setTypeChosen(false);
    }
  });

  return (
    <div className="flex flex-col gap-4">
      {identifiers.length === 0 ? (
        <p className="text-ink-muted">No identifiers. Many items have no barcode, so this is optional.</p>
      ) : (
        <ul className="flex flex-col">
          {identifiers.map((identifier) => (
            <li key={identifier.id} className="flex items-center gap-2 border-b border-border py-1 last:border-b-0">
              <span className="w-16 shrink-0 text-[12px] font-semibold text-ink-muted">{IDENTIFIER_TYPE_LABELS[identifier.type]}</span>
              <span className="min-w-0 flex-1 break-all tabular-nums">{identifier.value}</span>
              <Link
                href={`/lookup?q=${encodeURIComponent(identifier.value)}`}
                className="inline-flex min-h-11 items-center px-1 font-medium whitespace-nowrap"
                aria-label={`Look up prices for ${IDENTIFIER_TYPE_LABELS[identifier.type]} ${identifier.value}`}
              >
                Look up
              </Link>
              <IconButton
                aria-label={`Remove ${IDENTIFIER_TYPE_LABELS[identifier.type]} ${identifier.value}`}
                disabled={removing}
                onClick={() => {
                  setRemoveError(null);
                  startRemoving(async () => {
                    const result = await removeIdentifierAction(itemId, identifier.id);
                    if (!result.ok) setRemoveError(result.error);
                  });
                }}
              >
                <TrashIcon size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <FormError message={removeError} />

      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input type="hidden" name="itemId" value={itemId} />
        <FormError message={error && !fieldErrors.value ? error : null} />
        <div className="flex flex-wrap items-start gap-2">
          <Field label="Type" className="w-32">
            <Select
              name="type"
              value={type}
              onChange={(event) => {
                const parsed = identifierTypeSchema.safeParse(event.target.value);
                if (parsed.success) {
                  setType(parsed.data);
                  setTypeChosen(true);
                }
              }}
            >
              {IDENTIFIER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {IDENTIFIER_TYPE_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="New identifier" className="flex-[1_1_160px]" error={fieldErrors.value}>
            <Input
              name="value"
              value={value}
              onChange={(event) => {
                const next = event.target.value;
                setValue(next);
                // Until a type is picked by hand, it follows the value: 12 digits is a UPC, 978… is an ISBN-13.
                if (!typeChosen) {
                  const guess = guessIdentifierType(next);
                  if (guess !== "other") setType(guess);
                }
              }}
              autoComplete="off"
              maxLength={200}
              required
              className="tabular-nums"
            />
          </Field>
        </div>
        <div>
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add identifier"}
          </Button>
        </div>
      </form>
    </div>
  );
}
