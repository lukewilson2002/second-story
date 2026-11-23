import type { Metadata } from "next";
import Form from "next/form";
import { PageHeader } from "@/components/shell";
import { Button, Card, EmptyState, Field, FormError, Input, SearchIcon } from "@/components/ui";
import { cleanQuery, MAX_QUERY_LENGTH } from "@/features/lookup/query";
import { PRICE_SOURCES, sourceInfo } from "@/features/lookup/sources";
import { SourcePanel } from "@/features/lookup/SourcePanel";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Price lookup" };

/**
 * Price lookup. `?q=` runs a search straight away, which is how item detail and the quick actions link here.
 * The page itself fetches nothing: each source's card asks /api/lookup for its own results, so they load side by side.
 * Nothing found here is saved to an item.
 */
export default async function Page({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireUser();
  const { q } = await searchParams;
  const raw = (Array.isArray(q) ? q[0] : q) ?? "";
  const query = cleanQuery(raw);
  const tooLong = query === null && raw.trim().length > MAX_QUERY_LENGTH;
  const sources = PRICE_SOURCES.map(sourceInfo);

  return (
    <>
      <PageHeader title="Price lookup" description="Check what something sells for before you buy it or price it." />

      <Card>
        {/* The key resets the box to the searched text when a link changes ?q= while this page stays mounted. */}
        <Form key={query ?? ""} action="/lookup" role="search" className="flex flex-wrap items-end gap-3">
          <Field label="Search by title or barcode" className="min-w-0 flex-1 basis-64">
            <Input
              name="q"
              type="search"
              defaultValue={query ?? ""}
              maxLength={MAX_QUERY_LENGTH}
              required
              autoComplete="off"
              enterKeyHint="search"
              placeholder="Mario Kart Wii, or 045496590420"
            />
          </Field>
          <Button type="submit" variant="primary" icon={<SearchIcon size={18} />}>
            Search
          </Button>
        </Form>
        <p className="mt-2 text-[13px] text-ink-muted">
          A UPC, EAN or ISBN works too. eBay matches words in listing titles, so a title finds more there.
        </p>
        {tooLong ? <FormError className="mt-3" message={`Search for ${MAX_QUERY_LENGTH} characters or fewer.`} /> : null}
      </Card>

      {query ? (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
          {sources.map((source) => (
            <SourcePanel key={`${source.id}:${query}`} source={source} query={query} />
          ))}
        </div>
      ) : (
        <Card>
          <EmptyState
            title="Look up a price"
            description="Search by title or barcode to see PriceCharting's guide prices next to what recently sold on eBay. Any result can start a new inventory item."
          />
        </Card>
      )}
    </>
  );
}
