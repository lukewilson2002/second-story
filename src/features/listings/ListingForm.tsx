"use client";

import Link from "next/link";
import { useActionState, useMemo, useState, useTransition, type ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  CheckIcon,
  CloseIcon,
  Dialog,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Input,
  ItemThumbnail,
  MoneyInput,
  PercentInput,
  PlusIcon,
  SearchIcon,
  SegmentedControl,
  Stepper,
} from "@/components/ui";
import { cn } from "@/lib/cn";
import { categoriesById } from "@/lib/domain/categories";
import { resolveFeeRule } from "@/lib/domain/fees";
import { projectListingMarketplace } from "@/lib/domain/listings";
import { NO_FEES } from "@/lib/calc";
import { formatBps, formatCents, formatCount, parseDollarsToCents } from "@/lib/format";
import { createMarketplaceAction, saveListingAction } from "./actions";
import type { ListingFormMarketplaceValue, ListingFormOptions, ListingFormValues, MarketplaceOption } from "./types";
import { describeFeeRule } from "./view";

const PILL_BASE = "inline-flex min-h-11 items-center gap-1.5 rounded-pill text-[14px] cursor-pointer transition-colors";
const PILL_ON = "border border-primary bg-lilac pr-3.5 pl-2.5 font-semibold text-lilac-ink";
const PILL_OFF = "border border-border-input bg-surface px-3.5 font-medium text-ink hover:bg-ground";
// The colour token is also called "dashed", so `border-dashed` alone would only set the line style.
const PILL_NEW = "border border-dashed border-(--color-dashed) bg-transparent pr-3.5 pl-2.5 font-semibold text-primary-text hover:bg-lilac";

const PICKER_LIMIT = 60;

export interface ListingFormProps {
  options: ListingFormOptions;
  values: ListingFormValues;
  /**
   * Shown under the page header, for the manage panel of an existing listing.
   * It sits inside the form, so it must not contain a <form> of its own.
   */
  manage?: ReactNode;
}

/**
 * The new and edit listing screen from the "New listing" board.
 * The profit summary on the right updates as items, marketplaces, prices and shipping change.
 * It renders the page header itself, because Save as draft and Publish sit there and must be inside the form.
 */
export function ListingForm({ options, values, manage }: ListingFormProps) {
  const action = useMemo(() => saveListingAction.bind(null, values.id), [values.id]);
  const [state, formAction, pending] = useActionState(action, null);
  const fieldErrors = state && !state.ok ? state.fieldErrors : undefined;

  const [title, setTitle] = useState(values.title);
  const [titleTouched, setTitleTouched] = useState(values.title !== "");
  const [items, setItems] = useState(values.items);
  const [marketplaces, setMarketplaces] = useState<MarketplaceOption[]>(options.marketplaces);
  const [picked, setPicked] = useState<ListingFormMarketplaceValue[]>(values.marketplaces);
  const [askingCents, setAskingCents] = useState<number | null>(values.askingPriceCents);
  const [quantityText, setQuantityText] = useState(String(values.quantity));
  const [shippingChargedCents, setShippingChargedCents] = useState<number | null>(values.shippingChargedCents);
  const [estShippingCostCents, setEstShippingCostCents] = useState<number | null>(values.estShippingCostCents);
  const [commissionBps, setCommissionBps] = useState<number | null>(values.commissionBps);
  const [commissionPayee, setCommissionPayee] = useState(values.commissionPayee);
  const [shownMarketplaceId, setShownMarketplaceId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState("");
  const [addingMarketplace, setAddingMarketplace] = useState(false);
  const [newMarketplaceName, setNewMarketplaceName] = useState("");
  const [newMarketplaceError, setNewMarketplaceError] = useState<string | null>(null);
  const [creatingMarketplace, startCreatingMarketplace] = useTransition();

  const itemsById = useMemo(() => new Map(options.items.map((item) => [item.id, item])), [options.items]);
  const categoryMap = useMemo(() => categoriesById(options.categories), [options.categories]);
  const marketplaceName = (id: string) => marketplaces.find((marketplace) => marketplace.id === id)?.name ?? "Marketplace";

  const listingQuantity = /^\d+$/.test(quantityText.trim()) ? Math.max(1, Number(quantityText.trim())) : 1;
  const unitCostCents = items.reduce(
    (sum, item) => sum + (itemsById.get(item.itemId)?.avgUnitCostCents ?? 0) * item.quantityPerUnit,
    0,
  );
  const firstItem = items[0];
  // Fee rules are picked by the first item's category, the same rule recordSale uses when the listing sells.
  const feeCategoryId = firstItem ? (itemsById.get(firstItem.itemId)?.categoryId ?? null) : null;

  const projections = picked.map((row) => {
    const rule = resolveFeeRule(options.feeRules, row.marketplaceId, feeCategoryId, categoryMap);
    const overrideCents = row.price.trim() === "" ? null : parseDollarsToCents(row.price);
    return {
      marketplaceId: row.marketplaceId,
      name: marketplaceName(row.marketplaceId),
      rule,
      projection: projectListingMarketplace({
        listing: {
          askingPriceCents: askingCents ?? 0,
          shippingChargedCents: shippingChargedCents ?? 0,
          estShippingCostCents: estShippingCostCents ?? 0,
          commissionBps,
        },
        marketplaceAskingPriceCents: overrideCents,
        unitCostCents,
        rule: rule ?? NO_FEES,
      }),
      hasPrice: overrideCents !== null || (askingCents !== null && askingCents > 0),
    };
  });
  const shown = projections.find((row) => row.marketplaceId === shownMarketplaceId) ?? projections[0];
  const belowMinimum = projections.filter((row) => row.hasPrice && row.projection.belowMinimum);

  const shortOfStock = items
    .map((item) => ({ item, option: itemsById.get(item.itemId) }))
    .filter(({ item, option }) => option !== undefined && item.quantityPerUnit * listingQuantity > option.quantityOnHand);

  function toggleItem(itemId: string) {
    const option = itemsById.get(itemId);
    if (items.some((item) => item.itemId === itemId)) {
      setItems(items.filter((item) => item.itemId !== itemId));
      return;
    }
    setItems([...items, { itemId, quantityPerUnit: 1 }]);
    if (!titleTouched && title === "" && option) setTitle(option.title);
  }

  function toggleMarketplace(marketplaceId: string) {
    if (picked.some((row) => row.marketplaceId === marketplaceId)) {
      setPicked(picked.filter((row) => row.marketplaceId !== marketplaceId));
    } else {
      setPicked([...picked, { marketplaceId, url: "", price: "" }]);
    }
  }

  function updatePicked(marketplaceId: string, change: Partial<ListingFormMarketplaceValue>) {
    setPicked(picked.map((row) => (row.marketplaceId === marketplaceId ? { ...row, ...change } : row)));
  }

  function addMarketplace() {
    const name = newMarketplaceName.trim();
    if (name === "") {
      setNewMarketplaceError("Enter a name");
      return;
    }
    startCreatingMarketplace(async () => {
      const result = await createMarketplaceAction(name);
      if (!result.ok) {
        setNewMarketplaceError(result.error);
        return;
      }
      const created = result.data;
      setMarketplaces((current) => (current.some((row) => row.id === created.id) ? current : [...current, created]));
      setPicked((current) =>
        current.some((row) => row.marketplaceId === created.id)
          ? current
          : [...current, { marketplaceId: created.id, url: "", price: "" }],
      );
      setNewMarketplaceName("");
      setNewMarketplaceError(null);
      setAddingMarketplace(false);
    });
  }

  const isNew = values.id === null;
  const canBeDraft = isNew || values.status === "draft";
  const publishLabel = values.status === "active" ? "Save changes" : values.status === "ended" ? "Relist" : "Publish";

  const needle = pickerSearch.trim().toLowerCase();
  const pickerMatches = options.items.filter((item) => needle === "" || item.searchText.includes(needle));
  const pickerItems = pickerMatches.slice(0, PICKER_LIMIT);

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5"
      onKeyDown={(event) => {
        // Enter in a text field would press the form's first submit button, which is "Save as draft".
        if (event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
      }}
    >
      <PageHeader
        title={isNew ? "New listing" : "Edit listing"}
        breadcrumbs={[{ label: "Listings", href: "/listings" }, { label: isNew ? "New" : "Edit" }]}
        actions={
          <>
            {canBeDraft ? (
              <Button type="submit" name="intent" value="draft" disabled={pending}>
                Save as draft
              </Button>
            ) : (
              <ButtonLink href="/listings">Cancel</ButtonLink>
            )}
            <Button type="submit" name="intent" value="publish" variant="primary" disabled={pending}>
              {publishLabel}
            </Button>
          </>
        }
      />

      {manage}
      <FormError message={state && !state.ok ? state.error : null} />
      <input type="hidden" name="items" value={JSON.stringify(items)} />
      <input type="hidden" name="marketplaces" value={JSON.stringify(picked)} />

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-4">
          <Card>
            <div className="mb-2 flex items-center justify-between gap-3">
              <CardTitle>Items in this listing</CardTitle>
              <Button onClick={() => setPickerOpen(true)}>Add from inventory</Button>
            </div>
            {items.length === 0 ? (
              <p className="border-t border-border py-4 text-ink-muted">
                No items yet. Add one or more items from inventory. Several items make a bundle.
              </p>
            ) : (
              <ul className="m-0 list-none p-0">
                {items.map((item) => {
                  const option = itemsById.get(item.itemId);
                  const itemTitle = option?.title ?? "Item no longer in inventory";
                  return (
                    <li key={item.itemId} className="flex flex-wrap items-center gap-3 border-t border-border py-2.5">
                      <ItemThumbnail
                        imageUrl={option?.imageUrl}
                        categoryName={option?.categoryName ?? ""}
                        {...(option ? { toneKey: option.toneKey } : {})}
                      />
                      <div className="min-w-[140px] flex-1">
                        <div className="font-semibold">{itemTitle}</div>
                        {option ? (
                          <div className="text-ink-muted">
                            {option.categoryPath}, {formatCount(option.quantityOnHand)} in stock
                          </div>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-3 tabular-nums">
                        <Stepper
                          label={`Quantity of ${itemTitle}`}
                          value={item.quantityPerUnit}
                          onChange={(quantityPerUnit) =>
                            setItems(items.map((row) => (row.itemId === item.itemId ? { ...row, quantityPerUnit } : row)))
                          }
                          {...(option && option.quantityOnHand >= 1
                            ? { max: Math.max(option.quantityOnHand, item.quantityPerUnit) }
                            : {})}
                        />
                        <div className="min-w-[60px] text-right">
                          <div>{formatCents(option?.avgUnitCostCents ?? 0)}</div>
                          <div className="text-ink-muted">each</div>
                        </div>
                        <IconButton
                          aria-label={`Remove ${itemTitle} from this listing`}
                          onClick={() => setItems(items.filter((row) => row.itemId !== item.itemId))}
                        >
                          <CloseIcon size={18} />
                        </IconButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex justify-between border-t border-border pt-3 font-semibold tabular-nums">
              <span>Cost of goods</span>
              <span>{formatCents(unitCostCents)}</span>
            </div>
            {shortOfStock.length > 0 ? (
              <p role="status" className="mt-3 rounded-control bg-butter px-3 py-2.5 text-ink-secondary">
                {listingQuantity === 1 ? "One unit of this listing needs" : `${formatCount(listingQuantity)} units of this listing need`}{" "}
                more stock than you have of: {shortOfStock.map(({ option }) => option?.title ?? "").join(", ")}.
              </p>
            ) : null}
            {fieldErrors?.items?.[0] ? (
              <p role="alert" className="mt-3 text-[13px] font-medium text-danger">
                {fieldErrors.items[0]}
              </p>
            ) : null}
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Details</CardTitle>
            <Field label="Title" error={fieldErrors?.title}>
              <Input
                name="title"
                value={title}
                maxLength={500}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleTouched(true);
                }}
              />
            </Field>

            <div role="group" aria-labelledby="listing-marketplaces-label" className="flex flex-col gap-2">
              <div id="listing-marketplaces-label" className="font-medium">
                Marketplaces
              </div>
              <div className="flex flex-wrap gap-2">
                {marketplaces.map((marketplace) => {
                  const on = picked.some((row) => row.marketplaceId === marketplace.id);
                  return (
                    <button
                      key={marketplace.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMarketplace(marketplace.id)}
                      className={cn(PILL_BASE, on ? PILL_ON : PILL_OFF)}
                    >
                      {on ? <CheckIcon size={16} /> : null}
                      {marketplace.name}
                    </button>
                  );
                })}
                {addingMarketplace ? null : (
                  <button type="button" onClick={() => setAddingMarketplace(true)} className={cn(PILL_BASE, PILL_NEW)}>
                    <PlusIcon size={16} />
                    New marketplace
                  </button>
                )}
              </div>
              {addingMarketplace ? (
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="New marketplace name" error={newMarketplaceError} className="min-w-[200px] flex-1">
                    <Input
                      value={newMarketplaceName}
                      maxLength={80}
                      autoFocus
                      onChange={(event) => setNewMarketplaceName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") addMarketplace();
                      }}
                    />
                  </Field>
                  <div className={cn("flex gap-2", newMarketplaceError && "self-center")}>
                    <Button variant="primary" onClick={addMarketplace} disabled={creatingMarketplace}>
                      Add
                    </Button>
                    <Button
                      onClick={() => {
                        setAddingMarketplace(false);
                        setNewMarketplaceName("");
                        setNewMarketplaceError(null);
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : null}
              {fieldErrors?.marketplaces?.[0] ? (
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {fieldErrors.marketplaces[0]}
                </p>
              ) : null}
              {picked.length > 0 ? (
                <div className="mt-2 grid grid-cols-1 items-start gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  {picked.map((row, index) => {
                    const name = marketplaceName(row.marketplaceId);
                    return (
                      <div key={row.marketplaceId} className="contents">
                        <Field label={`${name} link`} optional error={fieldErrors?.[`marketplaces.${index}.url`]}>
                          <Input
                            type="url"
                            inputMode="url"
                            placeholder="https://"
                            value={row.url}
                            onChange={(event) => updatePicked(row.marketplaceId, { url: event.target.value })}
                          />
                        </Field>
                        <Field label={`${name} price`} optional error={fieldErrors?.[`marketplaces.${index}.price`]}>
                          <Input
                            inputMode="decimal"
                            autoComplete="off"
                            placeholder="Same as asking"
                            className="tabular-nums"
                            value={row.price}
                            onChange={(event) => updatePicked(row.marketplaceId, { price: event.target.value })}
                          />
                        </Field>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              {picked.length > 0 ? (
                <p className="text-ink-muted">
                  Links can be added later. A price here replaces the asking price on that marketplace only.
                </p>
              ) : null}
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Price and shipping</CardTitle>
            <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">
              <Field label="Asking price" error={fieldErrors?.askingPrice}>
                <MoneyInput
                  name="askingPrice"
                  className="font-semibold"
                  defaultValueCents={values.askingPriceCents}
                  onValueChange={setAskingCents}
                />
              </Field>
              <Field label="Quantity" error={fieldErrors?.quantity}>
                <Input
                  name="quantity"
                  inputMode="numeric"
                  autoComplete="off"
                  className="tabular-nums"
                  value={quantityText}
                  onChange={(event) => setQuantityText(event.target.value)}
                />
              </Field>
              <Field label="Shipping charged" error={fieldErrors?.shippingCharged}>
                <MoneyInput
                  name="shippingCharged"
                  defaultValueCents={values.shippingChargedCents}
                  onValueChange={setShippingChargedCents}
                />
              </Field>
              <Field label="Shipping cost" error={fieldErrors?.estShippingCost}>
                <MoneyInput
                  name="estShippingCost"
                  defaultValueCents={values.estShippingCostCents}
                  onValueChange={setEstShippingCostCents}
                />
              </Field>
            </div>
            <p className="text-ink-muted">
              Both shipping fields are optional and start at $0.00. Fill them in to sharpen the fee, minimum price and
              profit estimates; you enter the real amounts when you mark the listing sold.
              {values.soldQuantity > 0
                ? ` ${formatCount(values.soldQuantity)} of this listing ${values.soldQuantity === 1 ? "has" : "have"} already sold, so the quantity cannot go below that.`
                : ""}
            </p>
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>Commission (optional)</CardTitle>
            <div className="grid grid-cols-2 items-start gap-4 lg:grid-cols-4">
              <Field label="Share of profit" error={fieldErrors?.commissionPercent}>
                <PercentInput
                  name="commissionPercent"
                  defaultValueBps={values.commissionBps}
                  onValueChange={setCommissionBps}
                />
              </Field>
              <Field label="Paid to" className="lg:col-span-3" error={fieldErrors?.commissionPayee}>
                <Input
                  name="commissionPayee"
                  placeholder="Friend's name"
                  maxLength={200}
                  value={commissionPayee}
                  onChange={(event) => setCommissionPayee(event.target.value)}
                />
              </Field>
            </div>
          </Card>
        </div>

        <aside aria-label="Profit summary" className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <section className="rounded-card bg-peach p-5">
            <h2 className="text-eyebrow text-ink-secondary">Minimum price to break even</h2>
            {projections.length === 0 ? (
              <p className="mt-3 text-ink-secondary">Pick a marketplace to see the lowest price that still breaks even.</p>
            ) : (
              projections.map((row, index) => (
                <div
                  key={row.marketplaceId}
                  className={cn(
                    "mt-3 flex items-center justify-between gap-3 tabular-nums",
                    index > 0 && "border-t border-peach-border pt-3",
                  )}
                >
                  <div className="min-w-0">
                    <div className="font-semibold">{row.name}</div>
                    {row.projection.aboveMinimumCents === null ? (
                      <div>Fees take the whole price</div>
                    ) : row.hasPrice ? (
                      <div>
                        Asking price:{" "}
                        <span className="font-bold">{formatCents(row.projection.aboveMinimumCents, { showPlus: true })}</span>
                      </div>
                    ) : (
                      <div>Enter an asking price</div>
                    )}
                  </div>
                  <div className="font-display text-[32px] leading-[1.15] font-bold">
                    {row.projection.minimumPriceCents === null ? "None" : formatCents(row.projection.minimumPriceCents)}
                  </div>
                </div>
              ))
            )}
            {belowMinimum.length > 0 ? (
              <p role="status" className="mt-4 rounded-control bg-surface px-3 py-2.5 font-medium text-danger">
                The asking price is below the minimum on {belowMinimum.map((row) => row.name).join(" and ")}. A sale at this
                price loses money.
              </p>
            ) : null}
          </section>

          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <CardTitle>If it sells at asking</CardTitle>
              {projections.length > 1 && shown ? (
                <SegmentedControl
                  label="Marketplace shown"
                  options={projections.map((row) => ({ value: row.marketplaceId, label: row.name }))}
                  value={shown.marketplaceId}
                  onChange={setShownMarketplaceId}
                />
              ) : null}
            </div>
            {shown ? (
              <>
                <dl className="m-0 flex flex-col gap-2.5 tabular-nums">
                  <SummaryRow label="Item price" value={formatCents(shown.projection.askingPriceCents)} />
                  <SummaryRow label="Shipping charged" value={formatCents(shippingChargedCents ?? 0)} />
                  <SummaryRow muted label="Marketplace fee" value={formatCents(-shown.projection.atAsking.marketplaceFeeCents)} />
                  <SummaryRow muted label="Shipping cost" value={formatCents(-(estShippingCostCents ?? 0))} />
                  <SummaryRow muted label="Cost of goods" value={formatCents(-unitCostCents)} />
                  <SummaryRow
                    divider
                    label="Profit before commission"
                    value={formatCents(shown.projection.atAsking.profitBeforeCommissionCents)}
                  />
                  {commissionBps ? (
                    <SummaryRow
                      muted
                      label={`Commission, ${formatBps(commissionBps)}`}
                      value={formatCents(-shown.projection.atAsking.commissionCents)}
                    />
                  ) : null}
                </dl>
                <div
                  className={cn(
                    "mt-3.5 flex items-baseline justify-between rounded-[12px] px-3.5 py-3 tabular-nums",
                    shown.projection.atAsking.profitCents < 0 ? "bg-danger-tint" : "bg-mint",
                  )}
                >
                  <span className="font-semibold">Your profit</span>
                  <span
                    className={cn(
                      "font-display text-[26px] font-bold",
                      shown.projection.atAsking.profitCents < 0 ? "text-danger" : "text-profit-strong",
                    )}
                  >
                    {formatCents(shown.projection.atAsking.profitCents)}
                  </span>
                </div>
                <div className="mt-2.5 flex justify-between text-ink-muted tabular-nums">
                  <span>Margin on total paid</span>
                  <span>
                    {shown.projection.atAsking.marginBps === null
                      ? "None"
                      : formatBps(shown.projection.atAsking.marginBps, { fractionDigits: 1 })}
                  </span>
                </div>
                {listingQuantity > 1 ? <p className="mt-2.5 text-ink-muted">Figures are for one unit of the listing.</p> : null}
              </>
            ) : (
              <p className="text-ink-muted">Pick a marketplace to see the fee and your profit.</p>
            )}
          </Card>

          <Card className="px-5 py-4">
            <div className="font-semibold">Your fee rules</div>
            {projections.length === 0 ? (
              <p className="mt-1 text-ink-secondary">Fee rules are set per marketplace, and can differ by category.</p>
            ) : (
              projections.map((row) => (
                <p key={row.marketplaceId} className="mt-1 text-ink-secondary">
                  {row.name}: {describeFeeRule(row.rule)}
                </p>
              ))
            )}
            <Link href="/settings/marketplaces" className="mt-1 inline-flex min-h-11 items-center font-semibold text-primary-text">
              Edit fee rules
            </Link>
          </Card>
        </aside>
      </div>

      <Dialog
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Add from inventory"
        description="Pick the items this listing sells. Pick several for a bundle."
        footer={
          <Button variant="primary" onClick={() => setPickerOpen(false)}>
            Done
          </Button>
        }
      >
        {options.items.length === 0 ? (
          <EmptyState
            title="Nothing in stock"
            description="Add an item to inventory first, then list it."
            action={<ButtonLink href="/inventory/new">Add item</ButtonLink>}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="relative">
              <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted">
                <SearchIcon size={16} />
              </span>
              <Input
                type="search"
                aria-label="Search inventory by title or identifier"
                placeholder="Search title or identifier"
                className="pl-9"
                value={pickerSearch}
                onChange={(event) => setPickerSearch(event.target.value)}
              />
            </div>
            {pickerItems.length === 0 ? (
              <p className="py-4 text-ink-muted">No items match that search.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col p-0">
                {pickerItems.map((item) => {
                  const on = items.some((row) => row.itemId === item.id);
                  return (
                    <li key={item.id} className="border-t border-border first:border-t-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleItem(item.id)}
                        className={cn(
                          "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-control px-2 py-2 text-left hover:bg-ground",
                          on && "bg-lilac hover:bg-lilac",
                        )}
                      >
                        <ItemThumbnail imageUrl={item.imageUrl} categoryName={item.categoryName} toneKey={item.toneKey} />
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{item.title}</span>
                          <span className="block text-ink-secondary">
                            {item.categoryPath}, {formatCount(item.quantityOnHand)} in stock
                          </span>
                        </span>
                        <span className="tabular-nums">{formatCents(item.avgUnitCostCents)}</span>
                        <span className="flex w-5 justify-center text-lilac-ink">{on ? <CheckIcon size={18} /> : null}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {pickerMatches.length > pickerItems.length ? (
              <p className="text-ink-muted">
                Showing {formatCount(pickerItems.length)} of {formatCount(pickerMatches.length)} items. Search to narrow it down.
              </p>
            ) : null}
          </div>
        )}
      </Dialog>
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
