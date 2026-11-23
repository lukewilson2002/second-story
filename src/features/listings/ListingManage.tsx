"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  Dialog,
  ExternalLinkIcon,
  FormError,
  ListingStatusPill,
  Pill,
} from "@/components/ui";
import type { ActionResult } from "@/lib/action";
import { formatCents, formatCount, formatDate } from "@/lib/format";
import { deleteDraftListingAction, endListingAction, endListingMarketplaceAction } from "./actions";
import type { ListingDetail } from "./types";

type Confirm = { kind: "end" } | { kind: "delete" } | { kind: "marketplace"; marketplaceId: string; name: string };

/**
 * The panel at the top of an existing listing: where it stands, where it is up, and the actions that change that.
 * Its buttons call Server Actions directly instead of posting forms, because on the edit screen it sits inside the listing form.
 */
export function ListingManage({ detail }: { detail: ListingDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { values } = detail;
  const listingId = values.id;
  if (listingId === null) return null;
  const unitsLeft = values.quantity - values.soldQuantity;
  const activeMarketplaces = detail.marketplaces.filter((marketplace) => marketplace.status === "active");
  const canEnd = values.status === "active" || (values.status === "sold" && activeMarketplaces.length > 0);

  function run(action: () => Promise<ActionResult>, afterwards?: string) {
    startTransition(async () => {
      const result = await action();
      setConfirm(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      if (afterwards) router.push(afterwards);
      else router.refresh();
    });
  }

  function confirmed() {
    if (!confirm || listingId === null) return;
    if (confirm.kind === "end") run(() => endListingAction(listingId));
    else if (confirm.kind === "delete") run(() => deleteDraftListingAction(listingId), "/listings?tab=draft");
    else run(() => endListingMarketplaceAction(listingId, confirm.marketplaceId));
  }

  const dialog =
    confirm === null
      ? null
      : confirm.kind === "end"
        ? values.status === "sold"
          ? {
              title: "Mark as taken down everywhere?",
              body: "This records that the sold listing is no longer up on any marketplace. Take it down on the marketplaces yourself.",
              button: "Mark taken down",
            }
          : {
              title: "End this listing?",
              body: "It is marked ended on every marketplace here, and its items go back to In stock. Nothing changes on the marketplaces themselves. You can relist it later.",
              button: "End listing",
            }
        : confirm.kind === "delete"
          ? { title: "Delete this draft?", body: "The draft is removed. Its items stay in inventory.", button: "Delete draft" }
          : {
              title: `Take down from ${confirm.name}?`,
              body:
                activeMarketplaces.length === 1 && values.status === "active"
                  ? `${confirm.name} is the only marketplace this listing is up on, so the listing will be ended.`
                  : `The listing is marked as no longer up on ${confirm.name}. It stays up everywhere else.`,
              button: "Take down",
            };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Status</CardTitle>
          <ListingStatusPill status={values.status} />
          {values.status === "sold" && activeMarketplaces.length > 0 ? <Pill tone="butter">Still up elsewhere</Pill> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {values.status === "active" ? (
            <ButtonLink href={`/sales/new?listing=${listingId}`} variant="primary">
              Mark sold
            </ButtonLink>
          ) : null}
          {canEnd ? (
            <Button variant="danger" disabled={pending} onClick={() => setConfirm({ kind: "end" })}>
              {values.status === "sold" ? "Mark taken down everywhere" : "End listing"}
            </Button>
          ) : null}
          {values.status === "draft" ? (
            <Button variant="danger" disabled={pending} onClick={() => setConfirm({ kind: "delete" })}>
              Delete draft
            </Button>
          ) : null}
        </div>
      </div>

      <FormError message={error} />

      <p className="text-ink-secondary">
        {values.status === "draft"
          ? "Not published yet."
          : [
              detail.listedAt ? `Listed ${formatDate(detail.listedAt)}` : null,
              values.status !== "active" && detail.endedAt
                ? `${values.status === "sold" ? "sold out" : "ended"} ${formatDate(detail.endedAt)}`
                : null,
              detail.daysListed === null ? null : `${formatCount(detail.daysListed)} ${detail.daysListed === 1 ? "day" : "days"} listed`,
              `${formatCount(values.soldQuantity)} of ${formatCount(values.quantity)} sold`,
              values.status === "active" ? `${formatCount(unitsLeft)} left` : null,
            ]
              .filter((part) => part !== null)
              .join(", ") + "."}
      </p>

      {values.status !== "draft" && detail.marketplaces.length > 0 ? (
        <ul className="m-0 list-none p-0">
          {detail.marketplaces.map((marketplace) => (
            <li
              key={marketplace.marketplaceId}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border py-2"
            >
              <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-2">
                <span className="font-semibold">{marketplace.name}</span>
                <Pill tone={marketplace.status === "active" ? "lilac" : "neutral"}>
                  {marketplace.status === "active" ? "Up" : "Taken down"}
                </Pill>
                <span className="tabular-nums text-ink-secondary">
                  {formatCents(marketplace.askingPriceCents)}
                  {marketplace.minimumPriceCents === null ? "" : `, minimum ${formatCents(marketplace.minimumPriceCents)}`}
                </span>
                {marketplace.belowMinimum && marketplace.status === "active" && values.status === "active" ? (
                  <Pill tone="peach">Below minimum</Pill>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {marketplace.externalUrl ? (
                  <a
                    href={marketplace.externalUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary-text"
                  >
                    Open on {marketplace.name}
                    <ExternalLinkIcon size={15} />
                    <span className="visually-hidden"> (opens in a new tab)</span>
                  </a>
                ) : null}
                {marketplace.status === "active" && (values.status === "active" || values.status === "sold") ? (
                  <Button
                    disabled={pending}
                    onClick={() =>
                      setConfirm({ kind: "marketplace", marketplaceId: marketplace.marketplaceId, name: marketplace.name })
                    }
                  >
                    Take down<span className="visually-hidden"> from {marketplace.name}</span>
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <Dialog
        open={dialog !== null}
        onClose={() => setConfirm(null)}
        title={dialog?.title ?? ""}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>Cancel</Button>
            <Button variant="danger" disabled={pending} onClick={confirmed}>
              {dialog?.button ?? "Confirm"}
            </Button>
          </>
        }
      >
        <p>{dialog?.body}</p>
      </Dialog>
    </Card>
  );
}
