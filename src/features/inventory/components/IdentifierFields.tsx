"use client";

import { useRef, useState } from "react";
import { Button, IconButton, Input, PlusIcon, Select, TrashIcon } from "@/components/ui";
import { IDENTIFIER_TYPES, IDENTIFIER_TYPE_LABELS, guessIdentifierType, identifierTypeSchema, type IdentifierType } from "@/lib/schemas";
import { MAX_IDENTIFIERS } from "../schemas";

export interface IdentifierDraft {
  type: IdentifierType;
  value: string;
}

interface Row extends IdentifierDraft {
  key: number;
  /** True once the person has picked a type, so a later guess does not overwrite their choice. */
  typeChosen: boolean;
}

export interface IdentifierFieldsProps {
  /** The hidden field's name. It posts a JSON list of `{ type, value }`, blank rows left out. */
  name: string;
  initial?: readonly IdentifierDraft[];
  /** Called when a value field loses focus, with the non-blank rows. The add item form uses it to look for duplicates. */
  onCommit?: (identifiers: IdentifierDraft[]) => void;
  error?: string | undefined;
}

const filled = (rows: readonly Row[]): IdentifierDraft[] =>
  rows.filter((row) => row.value.trim() !== "").map(({ type, value }) => ({ type, value }));

/**
 * A list of typed identifiers (UPC, ISBN and so on) for the add item form.
 * If the type has not been picked by hand, it is guessed from the value when the field loses focus:
 * 12 digits is a UPC, 13 digits starting 978 is an ISBN-13.
 */
export function IdentifierFields({ name, initial = [], onCommit, error }: IdentifierFieldsProps) {
  const nextKey = useRef(initial.length);
  const [rows, setRows] = useState<Row[]>(() =>
    initial.length > 0
      ? initial.map((identifier, key) => ({ ...identifier, key, typeChosen: true }))
      : [{ key: 0, type: "upc", value: "", typeChosen: false }],
  );

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const commit = (key: number) => {
    const next = rows.map((row) => {
      if (row.key !== key || row.typeChosen || row.value.trim() === "") return row;
      const guess = guessIdentifierType(row.value);
      return guess === "other" ? row : { ...row, type: guess };
    });
    setRows(next);
    onCommit?.(filled(next));
  };

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name={name} value={JSON.stringify(filled(rows))} />
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row, index) => (
            <li key={row.key} className="flex items-center gap-2">
              <span className="block w-32 shrink-0">
                <Select
                  aria-label={`Identifier ${index + 1} type`}
                  value={row.type}
                  onChange={(event) => {
                    const type = identifierTypeSchema.safeParse(event.target.value);
                    if (type.success) update(row.key, { type: type.data, typeChosen: true });
                  }}
                >
                  {IDENTIFIER_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {IDENTIFIER_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
              </span>
              <Input
                aria-label={`Identifier ${index + 1} value`}
                value={row.value}
                onChange={(event) => update(row.key, { value: event.target.value })}
                onBlur={() => commit(row.key)}
                onKeyDown={(event) => {
                  // Handheld barcode scanners send Enter after the digits. That must not save the whole form.
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit(row.key);
                  }
                }}
                placeholder="Scan or type the number"
                autoComplete="off"
                maxLength={200}
                className="tabular-nums"
              />
              <IconButton
                aria-label={`Remove identifier ${index + 1}`}
                onClick={() => {
                  const next = rows.filter((candidate) => candidate.key !== row.key);
                  setRows(next);
                  onCommit?.(filled(next));
                }}
              >
                <TrashIcon size={18} />
              </IconButton>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-[13px] font-medium text-danger">{error}</p> : null}
      <div>
        <Button
          icon={<PlusIcon size={16} />}
          disabled={rows.length >= MAX_IDENTIFIERS}
          onClick={() => {
            nextKey.current += 1;
            setRows((current) => [...current, { key: nextKey.current, type: "upc", value: "", typeChosen: false }]);
          }}
        >
          Add identifier
        </Button>
      </div>
    </div>
  );
}
