import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { ButtonLink, Card, CardTitle, ItemStatusPill, ItemThumbnail, ListingStatusPill, SearchIcon } from "@/components/ui";
import { ItemDetailsForm } from "@/features/inventory/components/ItemDetailsForm";
import { ItemIdentifiers } from "@/features/inventory/components/ItemIdentifiers";
import { ItemPhotos } from "@/features/inventory/components/ItemPhotos";
import { ItemStock } from "@/features/inventory/components/ItemStock";
import { loadItemDetail } from "@/features/inventory/data";
import { requireUser } from "@/lib/auth";
import { cloudinaryImageUrl } from "@/lib/cloudinary";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain";
import { hasCloudinaryEnv } from "@/lib/env";
import { formatCents, formatCount, formatDate, todayIsoDate } from "@/lib/format";
import { uuidSchema } from "@/lib/schemas";

export const metadata: Metadata = { title: "Item" };

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-eyebrow">{label}</dt>
      <dd className="mt-1 font-display text-[20px] leading-tight font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  // A malformed id would make Postgres reject the query, so it is a 404 before any query runs.
  if (!uuidSchema.safeParse(id).success) notFound();
  const db = getDb();
  const today = todayIsoDate();
  const item = await loadItemDetail(db, userId, id, today);
  if (!item) notFound();
  const categories = await loadCategories(db, userId);
  const photos = item.photos.map((photo) => ({
    id: photo.id,
    url: cloudinaryImageUrl(photo.publicId, { width: 240, height: 240 }),
  }));
  const firstPhoto = item.photos[0];

  return (
    <>
      <PageHeader
        title={item.title}
        breadcrumbs={[{ label: "Inventory", href: "/inventory" }, { label: item.title }]}
        actions={
          <>
            <ButtonLink href={`/lookup?q=${encodeURIComponent(item.title)}`} icon={<SearchIcon size={16} />}>
              Price lookup
            </ButtonLink>
            {item.quantityOnHand > 0 ? (
              <ButtonLink href={`/listings/new?items=${item.id}`} variant="primary">
                Create listing
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <Card as="div" className="flex flex-wrap items-center gap-x-8 gap-y-4">
        <div className="flex items-center gap-3">
          <ItemThumbnail
            imageUrl={firstPhoto ? cloudinaryImageUrl(firstPhoto.publicId, { width: 56, height: 56 }) : null}
            categoryName={item.categoryName}
            toneKey={item.toneKey}
            size={56}
          />
          <div>
            <ItemStatusPill status={item.status} />
            <p className="mt-1 text-ink-secondary">{item.categoryPath}</p>
          </div>
        </div>
        <dl className="grid flex-1 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="On hand">{formatCount(item.quantityOnHand)}</Stat>
          <Stat label="Avg unit cost">{formatCents(item.summary.avgUnitCostCents)}</Stat>
          <Stat label="Stock cost">{formatCents(item.quantityOnHand * item.summary.avgUnitCostCents)}</Stat>
          <Stat label="First purchased">{formatDate(item.summary.firstPurchasedAt) || "–"}</Stat>
          <Stat label="Last purchased">{formatDate(item.summary.lastPurchasedAt) || "–"}</Stat>
          <Stat label="Days held">{item.daysHeld === null ? "–" : formatCount(item.daysHeld)}</Stat>
        </dl>
      </Card>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <CardTitle>Details</CardTitle>
            <ItemDetailsForm
              categories={categories}
              item={{
                id: item.id,
                title: item.title,
                categoryId: item.categoryId,
                condition: item.condition,
                storageLocation: item.storageLocation,
                description: item.description,
                notes: item.notes,
              }}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Purchase history</CardTitle>
            <ItemStock
              item={{
                id: item.id,
                title: item.title,
                quantityOnHand: item.quantityOnHand,
                avgUnitCostCents: item.summary.avgUnitCostCents,
              }}
              purchases={item.purchases}
              today={today}
            />
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Listing history</CardTitle>
            {item.listings.length === 0 ? (
              <p className="text-ink-muted">This item has not been in a listing yet.</p>
            ) : (
              <div className="overflow-x-auto" role="region" aria-label="Listing history table" tabIndex={0}>
                <table className="w-full min-w-[520px] border-collapse tabular-nums">
                  <caption className="visually-hidden">Listing history</caption>
                  <thead>
                    <tr className="text-left text-[12px] text-ink-muted">
                      <th scope="col" className="py-2 pr-2 font-semibold">
                        Listing
                      </th>
                      <th scope="col" className="px-2 py-2 font-semibold">
                        Status
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">
                        Units of this item
                      </th>
                      <th scope="col" className="px-2 py-2 text-right font-semibold">
                        Asking price
                      </th>
                      <th scope="col" className="py-2 pl-2 font-semibold">
                        Listed
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.listings.map((listing) => (
                      <tr key={listing.listingId} className="border-t border-border">
                        <td className="py-1 pr-2">
                          <Link href={`/listings/${listing.listingId}`} className="inline-flex min-h-11 items-center font-semibold">
                            {listing.title}
                          </Link>
                        </td>
                        <td className="px-2 py-1">
                          <ListingStatusPill status={listing.status} />
                        </td>
                        <td className="px-2 py-1 text-right">{formatCount(listing.quantityPerUnit)}</td>
                        <td className="px-2 py-1 text-right">{formatCents(listing.askingPriceCents)}</td>
                        <td className="py-1 pl-2 whitespace-nowrap text-ink-secondary">
                          {listing.listedAt ? formatDate(listing.listedAt) : "Not listed yet"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <Card className="flex flex-col gap-4">
            <CardTitle>Photos</CardTitle>
            <ItemPhotos itemId={item.id} photos={photos} configured={hasCloudinaryEnv()} />
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Identifiers</CardTitle>
            <ItemIdentifiers itemId={item.id} identifiers={item.identifiers} />
          </Card>
        </div>
      </div>
    </>
  );
}
