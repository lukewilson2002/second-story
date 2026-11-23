"use client";

import { useActionState, useState } from "react";
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  EmptyState,
  Field,
  FormError,
  Input,
  MoneyInput,
  SearchIcon,
  Select,
  Stepper,
  Tag,
} from "@/components/ui";
import { saleBreakdown } from "@/lib/calc";
import { cn } from "@/lib/cn";
import { centsToInputValue, formatBps, formatCents, formatCount, parseDollarsToCents } from "@/lib/format";
import { recordSaleAction } from "./actions";
import type { SellableListing } from "./types";

const LIST_LIMIT = 40;

export interface MarkSoldFormProps {
  listings: SellableListing[];
  /** From `?listing=`. Ignored if that listing cannot be sold. */
  initialListingId: string | null;
  /** Today in the app time zone, "YYYY-MM-DD". */
  today: string;
}

/**
 * Mark sold: find an active listing, then enter what the sale actually came to.
 * It asks for price, date, shipping cost and extra fees.
 * If the listing is on several marketplaces it asks which one, and if it has more than one unit left it asks how many sold.
 */
export function MarkSoldForm({ listings, initialListingId, today }: MarkSoldFormProps) {
  const [state, formAction, pending] = useActionState(recordSaleAction, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const initial = listings.find((listing) => listing.id === initialListingId) ?? null;
  const [listingId, setListingId] = useState<string | null>(initial?.id ?? null);
  const [search, setSearch] = useState("");
  const [marketplaceId, setMarketplaceId] = useState(initial?.marketplaces.length === 1 ? (initial.marketplaces[0]?.marketplaceId ?? "") : "");
  const [quantity, setQuantity] = useState(1);
  const [priceCents, setPriceCents] = useState<number | null>(
    initial ? (initial.marketplaces[0]?.askingPriceCents ?? null) : null,
  );
  // MoneyInput keeps its own text. A new key loads a new starting price into it.
  const [priceKey, setPriceKey] = useState(0);
  const [shippingCostCents, setShippingCostCents] = useState<number | null>(0);
  const [additionalFeesCents, setAdditionalFeesCents] = useState<number | null>(0);
  // Null means the fee follows the fee rule. Text means the person typed their own.
  const [feeText, setFeeText] = useState<string | null>(null);
  const [soldAt, setSoldAt] = useState(today);

  const listing = listings.find((row) => row.id === listingId) ?? null;
  const marketplace = listing?.marketplaces.find((row) => row.marketplaceId === marketplaceId) ?? null;

  function loadPrice(target: SellableListing, targetMarketplaceId: string, units: number) {
    const row = target.marketplaces.find((item) => item.marketplaceId === targetMarketplaceId) ?? target.marketplaces[0];
    setPriceCents(row ? row.askingPriceCents * units : null);
    setPriceKey((key) => key + 1);
  }

  function chooseListing(target: SellableListing) {
    const only = target.marketplaces.length === 1 ? (target.marketplaces[0]?.marketplaceId ?? "") : "";
    setListingId(target.id);
    setMarketplaceId(only);
    setQuantity(1);
    setFeeText(null);
    loadPrice(target, only, 1);
  }

  if (listings.length === 0) {
    return (
      <Card>
        <EmptyState
          title="No active listings to sell"
          description="Publish a listing first. Then mark it sold here when it sells."
          action={
            <ButtonLink href="/listings/new" variant="primary">
              New listing
            </ButtonLink>
          }
        />
      </Card>
    );
  }

  if (!listing) {
    const needle = search.trim().toLowerCase();
    const matches = listings.filter(
      (row) =>
        needle === "" ||
        row.title.toLowerCase().includes(needle) ||
        row.marketplaces.some((item) => item.name.toLowerCase().includes(needle)),
    );
    return (
      <Card className="flex max-w-[720px] flex-col gap-3">
        <CardTitle>Which listing sold?</CardTitle>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
            <SearchIcon size={16} />
          </span>
          <Input
            type="search"
            aria-label="Search active listings"
            placeholder="Search active listings"
            className="pl-9"
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {matches.length === 0 ? (
          <p className="py-3 text-ink-muted">No active listings match that search.</p>
        ) : (
          <ul className="m-0 list-none p-0">
            {matches.slice(0, LIST_LIMIT).map((row) => (
              <li key={row.id} className="border-t border-border first:border-t-0">
                <button
                  type="button"
                  onClick={() => chooseListing(row)}
                  className="flex min-h-11 w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-control px-2 py-2 text-left hover:bg-ground"
                >
                  <span className="min-w-[160px] flex-1 font-semibold">{row.title}</span>
                  <span className="flex flex-wrap gap-1.5">
                    {row.marketplaces.map((item) => (
                      <Tag key={item.marketplaceId}>{item.name}</Tag>
                    ))}
                  </span>
                  <span className="tabular-nums text-ink-secondary">
                    {row.quantityLeft > 1 ? `${formatCount(row.quantityLeft)} left, ` : ""}
                    {formatCents(row.marketplaces[0]?.askingPriceCents ?? 0)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {matches.length > LIST_LIMIT ? (
          <p className="text-ink-muted">
            Showing {formatCount(LIST_LIMIT)} of {formatCount(matches.length)} listings. Search to narrow it down.
          </p>
        ) : null}
      </Card>
    );
  }

  const shippingChargedCents = listing.shippingChargedCents * quantity;
  const costOfGoodsCents = listing.unitCostCents * quantity;
  const amounts = {
    priceCents: priceCents ?? 0,
    shippingChargedCents,
    shippingCostCents: shippingCostCents ?? 0,
    additionalFeesCents: additionalFeesCents ?? 0,
    costOfGoodsCents,
    commissionBps: listing.commissionBps,
  };
  const ruleFeeCents = marketplace ? saleBreakdown({ ...amounts, rule: marketplace.rule }).marketplaceFeeCents : null;
  const typedFeeCents = feeText === null ? null : parseDollarsToCents(feeText);
  const breakdown = marketplace
    ? saleBreakdown({
        ...amounts,
        rule: marketplace.rule,
        marketplaceFeeOverrideCents: feeText === null ? undefined : (typedFeeCents ?? 0),
      })
    : null;

  return (
    <form action={formAction} className="flex flex-wrap items-start gap-5">
      <input type="hidden" name="listingId" value={listing.id} />
      <div className="flex min-w-0 flex-[2_1_480px] flex-col gap-4">
        <FormError message={state && !state.ok ? state.error : null} />

        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-eyebrow text-ink-muted">Listing</div>
            <div className="font-display text-[17px] font-semibold">{listing.title}</div>
            <div className="text-ink-secondary">
              {formatCount(listing.quantityLeft)} {listing.quantityLeft === 1 ? "unit" : "units"} left, cost{" "}
              {formatCents(listing.unitCostCents)} each
            </div>
          </div>
          <Button onClick={() => setListingId(null)}>Change listing</Button>
        </Card>

        <Card className="flex flex-col gap-4">
          <CardTitle>The sale</CardTitle>
          <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
            {listing.marketplaces.length > 1 ? (
              <Field label="Sold on" error={fieldErrors?.marketplaceId}>
                <Select
                  name="marketplaceId"
                  value={marketplaceId}
                  onChange={(event) => {
                    setMarketplaceId(event.target.value);
                    setFeeText(null);
                    loadPrice(listing, event.target.value, quantity);
                  }}
                >
                  <option value="">Choose a marketplace</option>
                  {listing.marketplaces.map((row) => (
                    <option key={row.marketplaceId} value={row.marketplaceId}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="marketplaceId" value={marketplaceId} />
            )}
            <Field label="Sold date" error={fieldErrors?.soldAt}>
              <Input type="date" name="soldAt" max={today} value={soldAt} onChange={(event) => setSoldAt(event.target.value)} />
            </Field>
            {listing.quantityLeft > 1 ? (
              <div className="flex flex-col gap-1.5">
                <span id="mark-sold-quantity" className="font-medium">
                  Quantity sold
                </span>
                <Stepper
                  label="Quantity sold"
                  name="quantity"
                  value={quantity}
                  max={listing.quantityLeft}
                  onChange={(units) => {
                    setQuantity(units);
                    loadPrice(listing, marketplaceId, units);
                  }}
                  className="w-fit"
                />
                {fieldErrors?.quantity?.[0] ? (
                  <p role="alert" className="text-[13px] font-medium text-danger">
                    {fieldErrors.quantity[0]}
                  </p>
                ) : null}
              </div>
            ) : null}
            <Field
              label={quantity > 1 ? `Sale price for all ${formatCount(quantity)}` : "Sale price"}
              hint={shippingChargedCents > 0 ? `Item price only. Shipping charged, ${formatCents(shippingChargedCents)}, is added from the listing.` : "Item price only, before fees."}
              error={fieldErrors?.salePrice}
            >
              <MoneyInput
                key={priceKey}
                name="salePrice"
                className="font-semibold"
                defaultValueCents={priceCents}
                onValueChange={setPriceCents}
              />
            </Field>
            <Field label="Shipping cost" hint="What the label cost you." error={fieldErrors?.shippingCost}>
              <MoneyInput name="shippingCost" defaultValueCents={0} onValueChange={setShippingCostCents} />
            </Field>
            <Field label="Extra fees" hint="Promotions and ad fees." error={fieldErrors?.additionalFees}>
              <MoneyInput name="additionalFees" defaultValueCents={0} onValueChange={setAdditionalFeesCents} />
            </Field>
            <div className="flex flex-col gap-1">
              <Field
                label="Marketplace fee"
                hint={
                  feeText === null
                    ? "Worked out from your fee rule. Change it to match the real payout."
                    : "Your own amount. The fee rule is not used."
                }
                error={fieldErrors?.marketplaceFee}
              >
                <Input
                  inputMode="decimal"
                  autoComplete="off"
                  className="tabular-nums"
                  disabled={marketplace === null}
                  value={feeText ?? (ruleFeeCents === null ? "" : centsToInputValue(ruleFeeCents))}
                  onChange={(event) => setFeeText(event.target.value)}
                  // The field only posts a typed amount. With no name it is left out, and the server uses the fee rule.
                  {...(feeText === null ? {} : { name: "marketplaceFee" })}
                />
              </Field>
              {feeText !== null ? (
                <Button variant="ghost" className="w-fit" onClick={() => setFeeText(null)}>
                  Use the fee rule again
                </Button>
              ) : null}
            </div>
          </div>
        </Card>
      </div>

      <aside aria-label="Sale summary" className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Card>
          <CardTitle className="mb-3">This sale</CardTitle>
          {breakdown ? (
            <>
              <dl className="m-0 flex flex-col gap-2.5 tabular-nums">
                <SummaryRow label="Item price" value={formatCents(amounts.priceCents)} />
                <SummaryRow label="Shipping charged" value={formatCents(shippingChargedCents)} />
                <SummaryRow muted label="Marketplace fee" value={formatCents(-breakdown.marketplaceFeeCents)} />
                <SummaryRow muted label="Shipping cost" value={formatCents(-amounts.shippingCostCents)} />
                {amounts.additionalFeesCents > 0 ? (
                  <SummaryRow muted label="Extra fees" value={formatCents(-amounts.additionalFeesCents)} />
                ) : null}
                <SummaryRow muted label="Cost of goods" value={formatCents(-costOfGoodsCents)} />
                <SummaryRow divider label="Profit before commission" value={formatCents(breakdown.profitBeforeCommissionCents)} />
                {listing.commissionBps ? (
                  <SummaryRow
                    muted
                    label={`Commission, ${formatBps(listing.commissionBps)}`}
                    value={formatCents(-breakdown.commissionCents)}
                  />
                ) : null}
              </dl>
              <div
                className={cn(
                  "mt-3.5 flex items-baseline justify-between rounded-[12px] px-3.5 py-3 tabular-nums",
                  breakdown.profitCents < 0 ? "bg-danger-tint" : "bg-mint",
                )}
              >
                <span className="font-semibold">Your profit</span>
                <span
                  className={cn(
                    "font-display text-[26px] font-bold",
                    breakdown.profitCents < 0 ? "text-danger" : "text-profit-strong",
                  )}
                >
                  {formatCents(breakdown.profitCents)}
                </span>
              </div>
              <div className="mt-2.5 flex justify-between text-ink-muted tabular-nums">
                <span>Margin on total paid</span>
                <span>{breakdown.marginBps === null ? "None" : formatBps(breakdown.marginBps, { fractionDigits: 1 })}</span>
              </div>
            </>
          ) : (
            <p className="text-ink-muted">Choose the marketplace it sold on to see the fee and your profit.</p>
          )}
        </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" disabled={pending} className="flex-1">
            Mark sold
          </Button>
          <ButtonLink href="/sales">Cancel</ButtonLink>
        </div>
      </aside>
    </form>
  );
}

function SummaryRow({ label, value, muted, divider }: { label: string; value: string; muted?: boolean; divider?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-3", muted && "text-ink-secondary", divider && "border-t border-border pt-2.5")}>
      <dt>{label}</dt>
      <dd className="m-0">{value}</dd>
    </div>
  );
}
