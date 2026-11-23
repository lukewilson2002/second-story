import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell";
import { Card, CardTitle } from "@/components/ui";
import { ListingForm } from "@/features/listings/ListingForm";
import { ListingManage } from "@/features/listings/ListingManage";
import { loadListingDetail, loadListingFormOptions } from "@/features/listings/data";
import type { ListingDetail } from "@/features/listings/types";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatBps, formatCents, formatCount, formatDate } from "@/lib/format";
import { uuidSchema } from "@/lib/schemas";

export const metadata: Metadata = { title: "Listing" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const db = getDb();
  const detail = await loadListingDetail(db, userId, id);
  if (!detail) notFound();

  if (detail.values.status === "sold") return <SoldListing detail={detail} />;

  const options = await loadListingFormOptions(db, userId, {
    itemIds: detail.values.items.map((item) => item.itemId),
    marketplaceIds: detail.marketplaces.map((marketplace) => marketplace.marketplaceId),
  });
  // The form keeps its own copy of the picked marketplaces.
  // If one is taken down from the manage panel, the key changes and the form starts again from the saved listing.
  const formKey = [
    detail.values.status,
    ...detail.marketplaces.map((marketplace) => `${marketplace.marketplaceId}:${marketplace.status}`),
  ].join("|");
  return (
    <>
      <ListingForm key={formKey} options={options} values={detail.values} manage={<ListingManage detail={detail} />} />
      {detail.sales.length > 0 ? <SalesCard detail={detail} /> : null}
    </>
  );
}

function SalesCard({ detail }: { detail: ListingDetail }) {
  return (
    <Card padding="none">
      <div className="px-5 pt-5 pb-3">
        <CardTitle>Sales of this listing</CardTitle>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse">
          <thead>
            <tr className="text-left text-ink-muted">
              <th scope="col" className="px-5 py-2.5 font-medium">Sold</th>
              <th scope="col" className="px-3 py-2.5 font-medium">Marketplace</th>
              <th scope="col" className="num px-3 py-2.5 font-medium">Quantity</th>
              <th scope="col" className="num px-3 py-2.5 font-medium">Revenue</th>
              <th scope="col" className="num px-5 py-2.5 font-medium">Profit</th>
            </tr>
          </thead>
          <tbody>
            {detail.sales.map((sale) => (
              <tr key={sale.id} className="border-t border-border">
                <td className="px-5 py-3 whitespace-nowrap">{formatDate(sale.soldAt)}</td>
                <td className="px-3 py-3">{sale.marketplaceName}</td>
                <td className="num px-3 py-3">{formatCount(sale.quantity)}</td>
                <td className="num px-3 py-3">{formatCents(sale.revenueCents)}</td>
                <td className="num px-5 py-3 font-semibold text-profit">{formatCents(sale.profitCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="border-t border-border px-5">
        <Link href="/sales" className="inline-flex min-h-11 items-center font-semibold text-primary-text">
          All sales
        </Link>
      </div>
    </Card>
  );
}

/** A sold listing is history, so it is shown read-only. Only its leftover marketplace rows can still be taken down. */
function SoldListing({ detail }: { detail: ListingDetail }) {
  const { values } = detail;
  return (
    <>
      <PageHeader
        title={values.title}
        breadcrumbs={[{ label: "Listings", href: "/listings?tab=sold" }, { label: "Sold" }]}
      />
      <ListingManage detail={detail} />
      <div className="flex flex-wrap items-start gap-5">
        <Card className="flex-[2_1_420px]">
          <CardTitle>Items in this listing</CardTitle>
          <ul className="m-0 mt-2 list-none p-0">
            {detail.items.map((item) => (
              <li key={item.itemId} className="flex items-center justify-between gap-3 border-t border-border">
                <Link href={`/inventory/${item.itemId}`} className="inline-flex min-h-11 items-center font-semibold text-ink">
                  {item.title}
                </Link>
                <span className="tabular-nums text-ink-secondary">
                  {formatCount(item.quantityPerUnit)} per unit, {formatCents(item.avgUnitCostCents)} each
                </span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="flex-[1_1_280px]">
          <CardTitle>Listed at</CardTitle>
          <dl className="m-0 mt-3 flex flex-col gap-2.5 tabular-nums">
            <Row label="Asking price" value={formatCents(values.askingPriceCents ?? 0)} />
            <Row label="Quantity" value={formatCount(values.quantity)} />
            <Row label="Shipping charged" value={formatCents(values.shippingChargedCents)} />
            <Row label="Estimated shipping cost" value={formatCents(values.estShippingCostCents)} />
            {values.commissionBps ? (
              <Row
                label={values.commissionPayee ? `Commission to ${values.commissionPayee}` : "Commission"}
                value={formatBps(values.commissionBps)}
              />
            ) : null}
          </dl>
        </Card>
      </div>
      <SalesCard detail={detail} />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-secondary">{label}</dt>
      <dd className="m-0">{value}</dd>
    </div>
  );
}
