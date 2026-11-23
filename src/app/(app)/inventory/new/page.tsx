import type { Metadata } from "next";
import { PageHeader } from "@/components/shell";
import { Tabs } from "@/components/ui";
import { LotForm } from "@/features/inventory/components/LotForm";
import { NewItemForm } from "@/features/inventory/components/NewItemForm";
import { findDuplicateItems } from "@/features/inventory/data";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain";
import { hasCloudinaryEnv } from "@/lib/env";
import { todayIsoDate } from "@/lib/format";
import { guessIdentifierType, identifierTypeSchema, normalizeIdentifier } from "@/lib/schemas";

export const metadata: Metadata = { title: "Add item" };

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Add item. `?title=`, `?identifier=` and `?identifierType=` prefill the form (from a barcode scan or a price lookup result).
 * `?mode=lot` shows lot entry instead.
 */
export default async function NewItemPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const userId = await requireUser();
  const params = await searchParams;
  const db = getDb();
  const categories = await loadCategories(db, userId);
  const today = todayIsoDate();
  const lot = first(params.mode) === "lot";

  const title = first(params.title).trim().slice(0, 500);
  const identifierValue = first(params.identifier).trim().slice(0, 200);
  const givenType = identifierTypeSchema.safeParse(first(params.identifierType));
  const identifierType = givenType.success ? givenType.data : guessIdentifierType(identifierValue);
  const identifiers =
    identifierValue !== "" && normalizeIdentifier(identifierType, identifierValue) !== ""
      ? [{ type: identifierType, value: normalizeIdentifier(identifierType, identifierValue) }]
      : [];
  const initialDuplicates = lot || (title === "" && identifiers.length === 0) ? [] : await findDuplicateItems(db, userId, { title, identifiers });

  return (
    <>
      <PageHeader title="Add item" breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: "Add item" }]}>
        <Tabs
          label="What to add"
          items={[
            { href: "/inventory/new", label: "One item", current: !lot },
            { href: "/inventory/new?mode=lot", label: "A lot for one price", current: lot },
          ]}
        />
      </PageHeader>
      {lot ? (
        <LotForm categories={categories} today={today} />
      ) : (
        <NewItemForm
          // A new scan or lookup result arrives as a new query string. The key starts the form again with that prefill.
          key={`${title}|${identifierType}|${identifierValue}`}
          categories={categories}
          today={today}
          photosConfigured={hasCloudinaryEnv()}
          prefill={{ title, identifiers }}
          initialDuplicates={initialDuplicates}
        />
      )}
    </>
  );
}
