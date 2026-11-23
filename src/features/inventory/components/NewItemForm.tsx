"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { Button, ButtonLink, Card, CardTitle, CategoryPicker, Field, FormError, Input, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/action";
import type { CategoryRecord } from "@/lib/domain/categories";
import { formatCount } from "@/lib/format";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/schemas";
import { checkDuplicatesAction, createItemAction, type CreateItemOutcome } from "../actions";
import type { DuplicateMatch } from "../data";
import { useFormAction } from "../use-form-action";
import { IdentifierFields, type IdentifierDraft } from "./IdentifierFields";
import { NewItemPhotos } from "./NewItemPhotos";
import { PurchaseFields } from "./PurchaseFields";

export interface NewItemFormProps {
  categories: readonly CategoryRecord[];
  today: string;
  photosConfigured: boolean;
  /** From the query string: a barcode scan or a price lookup result. */
  prefill: { title: string; identifiers: readonly IdentifierDraft[] };
  /** Existing items that already match the prefill, found on the server so they show without waiting. */
  initialDuplicates: readonly DuplicateMatch[];
}

interface Carried {
  categoryId: string;
  purchasedAt: string;
  source: string;
}

function draftKey(draft: { title: string; identifiers: readonly IdentifierDraft[] }): string {
  return JSON.stringify([draft.title.trim(), draft.identifiers.map((identifier) => [identifier.type, identifier.value.trim()])]);
}

type Saved = { kind: "created"; id: string; title: string } | { kind: "restocked"; id: string; title: string };

/**
 * The add item form. It records the item and its first purchase.
 *
 * "Save and add another" clears the form and keeps the category, date and source, since one shopping trip usually shares them.
 * If the title or an identifier matches an existing item, a panel offers to add the purchase to that item instead.
 * The check runs when the title or an identifier field loses focus, and again on the server when the form is saved.
 */
export function NewItemForm({ categories, today, photosConfigured, prefill, initialDuplicates }: NewItemFormProps) {
  const router = useRouter();
  const [formKey, setFormKey] = useState(0);
  const [carried, setCarried] = useState<Carried>({ categoryId: "", purchasedAt: today, source: "" });
  const [saved, setSaved] = useState<Saved | null>(null);
  const [duplicates, setDuplicates] = useState<readonly DuplicateMatch[]>(initialDuplicates);
  // True if the server refused to save because of duplicates, so the panel says nothing was saved.
  const [blocked, setBlocked] = useState(false);
  const draft = useRef<{ title: string; identifiers: IdentifierDraft[] }>({
    title: prefill.title,
    identifiers: [...prefill.identifiers],
  });
  const checkId = useRef(0);
  // The title and identifiers the duplicates on screen were found for.
  // Saving only counts as "create a separate item anyway" if the form still holds those same values.
  const duplicatesFor = useRef(draftKey({ title: prefill.title, identifiers: prefill.identifiers }));
  // Which save button was pressed last. "Add stock to this item" in the duplicate panel carries on with the same choice.
  // The ref is read when the result comes back. The state only drives the "Saving…" label.
  const lastIntent = useRef<"save" | "another">("save");
  const [intent, setIntent] = useState<"save" | "another">("save");
  const chooseIntent = (next: "save" | "another") => {
    lastIntent.current = next;
    setIntent(next);
  };

  const onResult = useCallback(
    (result: ActionResult<CreateItemOutcome>, formData: FormData) => {
      if (!result.ok) return;
      const outcome = result.data;
      if (outcome.kind === "duplicates") {
        duplicatesFor.current = draftKey(draft.current);
        setDuplicates(outcome.matches);
        setBlocked(true);
        return;
      }
      if (lastIntent.current === "save") {
        router.push(`/inventory/${outcome.id}`);
        return;
      }
      const text = (name: string) => {
        const value = formData.get(name);
        return typeof value === "string" ? value : "";
      };
      setCarried({ categoryId: text("categoryId"), purchasedAt: text("purchasedAt") || today, source: text("source") });
      setSaved(
        outcome.kind === "created"
          ? outcome
          : { kind: "restocked", id: outcome.id, title: duplicates.find((match) => match.id === outcome.id)?.title ?? "the item" },
      );
      setDuplicates([]);
      setBlocked(false);
      draft.current = { title: "", identifiers: [] };
      // A new key remounts the form, which is the only way to empty the money field and the photo list.
      setFormKey((key) => key + 1);
    },
    [router, today, duplicates],
  );
  const { submit, pending, error, fieldErrors } = useFormAction(createItemAction, onResult);

  const checkDuplicates = useCallback(() => {
    const id = ++checkId.current;
    const { title, identifiers } = draft.current;
    const key = draftKey(draft.current);
    if (title.trim() === "" && identifiers.length === 0) {
      setDuplicates([]);
      setBlocked(false);
      return;
    }
    void checkDuplicatesAction({ title, identifiers }).then((matches) => {
      // An older check can finish after a newer one. Only the latest answer is shown.
      if (id !== checkId.current) return;
      duplicatesFor.current = key;
      setDuplicates(matches);
      if (matches.length === 0) setBlocked(false);
    });
  }, []);

  const firstForm = formKey === 0;
  const identifierError = Object.entries(fieldErrors).find(([key]) => key.startsWith("identifiers"))?.[1]?.[0];

  return (
    <form
      key={formKey}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (duplicates.length > 0 && duplicatesFor.current === draftKey(draft.current)) formData.set("confirmNew", "1");
        submit(formData);
      }}
      className="flex max-w-3xl flex-col gap-5"
    >
      {saved ? (
        <p role="status" className="rounded-control bg-mint px-3 py-2.5 font-medium text-profit-strong">
          {saved.kind === "created" ? "Saved " : "Added stock to "}
          <Link href={`/inventory/${saved.id}`} className="inline-flex min-h-11 items-center font-semibold text-profit-strong underline">
            {saved.title}
          </Link>
          . Add the next one below.
        </p>
      ) : null}
      <FormError message={error} />

      <Card className="flex flex-col gap-4">
        <CardTitle>Item</CardTitle>
        <Field label="Title" error={fieldErrors.title} hint="A short name, as it should show in tables.">
          <Input
            name="title"
            defaultValue={firstForm ? prefill.title : ""}
            required
            maxLength={500}
            autoComplete="off"
            autoFocus
            onChange={(event) => {
              draft.current.title = event.target.value;
            }}
            onBlur={checkDuplicates}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" error={fieldErrors.categoryId}>
            <CategoryPicker
              categories={categories}
              name="categoryId"
              defaultValue={carried.categoryId}
              emptyLabel="Choose a category"
              required
            />
          </Field>
          <Field label="Condition" optional error={fieldErrors.condition}>
            <Input name="condition" placeholder="Like new, good, worn" maxLength={200} />
          </Field>
          <Field label="Storage location" optional error={fieldErrors.storageLocation} hint="Bin or shelf.">
            <Input name="storageLocation" maxLength={200} />
          </Field>
        </div>
        <Field label="Notes" optional error={fieldErrors.notes}>
          <Textarea name="notes" maxLength={5000} />
        </Field>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Identifiers</CardTitle>
        <p className="text-ink-muted">Optional. UPC, EAN and ISBN are saved as digits only, so hyphens and spaces do not matter.</p>
        <IdentifierFields
          name="identifiers"
          initial={firstForm ? prefill.identifiers : []}
          error={identifierError}
          onCommit={(identifiers) => {
            draft.current.identifiers = identifiers;
            checkDuplicates();
          }}
        />
      </Card>

      {duplicates.length > 0 ? (
        <div
          className="flex flex-col gap-3 rounded-card border border-peach-border bg-peach p-5"
          role="region"
          aria-label="Possible duplicates"
        >
          <div>
            <h2 className="text-h2">{blocked ? "Not saved yet: you may already have this" : "You may already have this"}</h2>
            <p className="mt-1 text-ink-secondary">
              Add this purchase to the existing item to keep one row with a combined quantity and average cost. To keep them
              separate, save again and a new item is created.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {duplicates.map((match) => (
              <li key={match.id} className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface px-3 py-2">
                <div className="min-w-0">
                  <Link href={`/inventory/${match.id}`} className="inline-flex min-h-11 items-center font-semibold">
                    {match.title}
                  </Link>
                  <p className="text-ink-muted">
                    {match.identifier
                      ? `Same ${IDENTIFIER_TYPE_LABELS[match.identifier.type]} ${match.identifier.value}`
                      : "Same title"}
                    , {formatCount(match.quantityOnHand)} on hand
                  </p>
                </div>
                {/*
                  Not a submit button. Pressing Enter in a field must save the item, not pick the first button in the form.
                  It also skips the browser's required-field checks, because adding stock needs only the purchase fields.
                */}
                <Button
                  disabled={pending}
                  onClick={(event) => {
                    if (!event.currentTarget.form) return;
                    const formData = new FormData(event.currentTarget.form);
                    formData.set("existingItemId", match.id);
                    submit(formData);
                  }}
                >
                  Add stock to this item
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Card className="flex flex-col gap-4">
        <CardTitle>First purchase</CardTitle>
        <PurchaseFields
          fieldErrors={fieldErrors}
          today={today}
          defaultPurchasedAt={carried.purchasedAt}
          defaultSource={carried.source}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Photos</CardTitle>
        <NewItemPhotos name="photos" configured={photosConfigured} />
        {fieldErrors.photos ? <p className="text-[13px] font-medium text-danger">{fieldErrors.photos[0]}</p> : null}
      </Card>

      {/*
        Pressing Enter in a field clicks the first submit button.
        After "Save and add another" that button comes first, so Enter keeps adding items and does not leave the page.
      */}
      <div className="flex flex-wrap gap-2">
        {intent === "another" ? (
          <>
            <Button type="submit" variant="primary" disabled={pending} onClick={() => chooseIntent("another")}>
              {pending ? "Saving…" : "Save and add another"}
            </Button>
            <Button type="submit" disabled={pending} onClick={() => chooseIntent("save")}>
              Save item
            </Button>
          </>
        ) : (
          <>
            <Button type="submit" variant="primary" disabled={pending} onClick={() => chooseIntent("save")}>
              {pending ? "Saving…" : "Save item"}
            </Button>
            <Button type="submit" disabled={pending} onClick={() => chooseIntent("another")}>
              Save and add another
            </Button>
          </>
        )}
        <ButtonLink href="/inventory" variant="ghost">
          Cancel
        </ButtonLink>
      </div>
    </form>
  );
}
