"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Button,
  Card,
  CardTitle,
  CategoryPicker,
  Dialog,
  EmptyState,
  Field,
  FormError,
  Input,
  MoneyInput,
  PercentInput,
  Pill,
  PlusIcon,
} from "@/components/ui";
import { categoryPath, type CategoryRecord } from "@/lib/domain/categories";
import type { FeeRuleRecord } from "@/lib/domain/fees";
import { formatCents } from "@/lib/format";
import {
  createMarketplaceAction,
  deleteFeeRuleAction,
  renameMarketplaceAction,
  saveFeeRuleAction,
  setMarketplaceArchivedAction,
} from "../actions";
import type { MarketplaceRecord } from "../data";
import { describeFeeBase, describeFeeTerms, sampleFeeCents } from "../fee-format";
import { NAME_MAX_LENGTH } from "../schemas";
import { FeePreview } from "./FeePreview";
import { useActionForm } from "./useActionForm";

/** The sample sale used by the live preview in the fee rule dialog. */
const SAMPLE_PRICE_CENTS = 2000;
const SAMPLE_SHIPPING_CENTS = 500;

type OpenDialog =
  | { kind: "add" }
  | { kind: "rename"; id: string }
  /** `ruleId` null is a new rule. */
  | { kind: "rule"; marketplaceId: string; ruleId: string | null }
  | null;

export interface MarketplacesManagerProps {
  /** Every marketplace, archived ones included. */
  marketplaces: readonly MarketplaceRecord[];
  feeRules: readonly FeeRuleRecord[];
  /** Every category, archived ones included. */
  categories: readonly CategoryRecord[];
}

/** Marketplaces with their fee rules: add, rename, archive, and edit the rules for each. */
export function MarketplacesManager({ marketplaces, feeRules, categories }: MarketplacesManagerProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const close = () => setDialog(null);
  const archive = useActionForm(setMarketplaceArchivedAction);
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  const active = marketplaces.filter((marketplace) => !marketplace.archived);
  const archived = marketplaces.filter((marketplace) => marketplace.archived);
  const renaming = dialog?.kind === "rename" ? (marketplaces.find((entry) => entry.id === dialog.id) ?? null) : null;
  const ruleMarketplace =
    dialog?.kind === "rule" ? (marketplaces.find((entry) => entry.id === dialog.marketplaceId) ?? null) : null;
  const ruleBeingEdited =
    dialog?.kind === "rule" && dialog.ruleId !== null ? (feeRules.find((rule) => rule.id === dialog.ruleId) ?? null) : null;

  return (
    <>
      <PageHeader
        title="Marketplaces and fee rules"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Marketplaces" }]}
        description="Where you sell, and what each place charges."
        actions={
          <Button variant="primary" icon={<PlusIcon size={18} />} onClick={() => setDialog({ kind: "add" })}>
            Add marketplace
          </Button>
        }
      />

      <Card className="flex flex-col gap-2">
        <CardTitle>How fee rules work</CardTitle>
        <p className="max-w-3xl text-ink-secondary">
          Second Story ships with no built-in rates, because marketplaces change them and they differ by category. Enter each
          marketplace&apos;s current fees here. They set the fee estimate, the minimum price and the projected profit on every
          listing.
        </p>
        <p className="max-w-3xl text-ink-secondary">
          A marketplace can have one default rule and extra rules for specific categories.{" "}
          <strong className="font-semibold text-ink">The most specific category match wins.</strong> An item uses the rule on
          its own category. If there is none, it uses the nearest parent category that has a rule, and after that the
          marketplace default.
        </p>
      </Card>

      <FormError message={archive.formError} />

      {active.length === 0 ? (
        <Card>
          <EmptyState
            title="No marketplaces"
            description="Add the places you sell, then enter what each one charges."
            action={
              <Button variant="primary" onClick={() => setDialog({ kind: "add" })}>
                Add marketplace
              </Button>
            }
          />
        </Card>
      ) : null}

      {active.map((marketplace) => {
        const rules = sortRules(
          feeRules.filter((rule) => rule.marketplaceId === marketplace.id),
          byId,
        );
        const hasDefault = rules.some((rule) => rule.categoryId === null);
        return (
          <Card key={marketplace.id} className="flex flex-col gap-3" aria-label={marketplace.name}>
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <CardTitle>{marketplace.name}</CardTitle>
              <div className="flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  aria-label={`Rename ${marketplace.name}`}
                  onClick={() => setDialog({ kind: "rename", id: marketplace.id })}
                >
                  Rename
                </Button>
                <Button
                  variant="ghost"
                  aria-label={`Archive ${marketplace.name}`}
                  disabled={archive.pending}
                  onClick={() => archive.submit({ id: marketplace.id, archived: "true" })}
                >
                  Archive
                </Button>
              </div>
            </div>

            {rules.length === 0 ? (
              <div className="flex flex-col items-start gap-2 rounded-control border border-peach-border bg-peach px-4 py-3.5">
                <p className="font-semibold">No fees entered for {marketplace.name} yet</p>
                <p className="max-w-2xl text-ink-secondary">
                  Until you enter them, minimum prices and profit for {marketplace.name} are worked out as if it charged
                  nothing. Look up its current seller fees and enter them as the default rule.
                </p>
                <Button
                  variant="primary"
                  className="mt-1"
                  onClick={() => setDialog({ kind: "rule", marketplaceId: marketplace.id, ruleId: null })}
                >
                  Enter fees for {marketplace.name}
                </Button>
              </div>
            ) : (
              <>
                <ul className="rounded-control border border-border">
                  {rules.map((rule) => {
                    const label = rule.categoryId === null ? "Default" : categoryPath(rule.categoryId, byId);
                    const base = describeFeeBase(rule);
                    return (
                      <li
                        key={rule.id}
                        className="flex items-center gap-3 border-b border-border py-2 pr-2 pl-4 last:border-b-0"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{label}</span>
                            {rule.categoryId === null ? <Pill tone="lilac">All other categories</Pill> : null}
                            {rule.categoryId !== null && byId.get(rule.categoryId)?.archived ? <Pill>Archived category</Pill> : null}
                          </div>
                          <p className="tabular-nums text-ink-secondary">{describeFeeTerms(rule)}</p>
                          {base ? <p className="text-[13px] text-ink-muted">{base}</p> : null}
                        </div>
                        <Button
                          aria-label={`Edit the ${label} rule for ${marketplace.name}`}
                          onClick={() => setDialog({ kind: "rule", marketplaceId: marketplace.id, ruleId: rule.id })}
                        >
                          Edit
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                {hasDefault ? null : (
                  <p className="text-ink-secondary">
                    {marketplace.name} has no default rule, so categories without a rule of their own are charged no fees.
                  </p>
                )}
                <div>
                  <Button
                    icon={<PlusIcon size={18} />}
                    aria-label={`Add a fee rule for ${marketplace.name}`}
                    onClick={() => setDialog({ kind: "rule", marketplaceId: marketplace.id, ruleId: null })}
                  >
                    Add rule
                  </Button>
                </div>
              </>
            )}
          </Card>
        );
      })}

      {active.length > 0 ? <FeePreview marketplaces={active} feeRules={feeRules} categories={categories} /> : null}

      {archived.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <CardTitle>Archived marketplaces</CardTitle>
          <p className="text-ink-muted">
            Archived marketplaces keep their fee rules, listings and sales. They just cannot be picked for new listings.
          </p>
          <ul className="rounded-control border border-border">
            {archived.map((marketplace) => (
              <li key={marketplace.id} className="flex items-center gap-3 border-b border-border py-1.5 pr-2 pl-4 last:border-b-0">
                <span className="min-w-0 flex-1 font-medium text-ink-secondary">{marketplace.name}</span>
                <Button
                  aria-label={`Unarchive ${marketplace.name}`}
                  disabled={archive.pending}
                  onClick={() => archive.submit({ id: marketplace.id, archived: "false" })}
                >
                  Unarchive
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Dialog open={dialog?.kind === "add"} onClose={close} title="Add marketplace">
        {dialog?.kind === "add" ? <MarketplaceNameForm marketplace={null} onDone={close} /> : null}
      </Dialog>

      <Dialog open={renaming !== null} onClose={close} title="Rename marketplace">
        {renaming ? <MarketplaceNameForm key={renaming.id} marketplace={renaming} onDone={close} /> : null}
      </Dialog>

      <Dialog
        open={ruleMarketplace !== null}
        onClose={close}
        title={ruleMarketplace ? `${ruleBeingEdited ? "Edit" : "Add"} fee rule for ${ruleMarketplace.name}` : "Fee rule"}
      >
        {dialog?.kind === "rule" && ruleMarketplace ? (
          <FeeRuleForm
            // MoneyInput and PercentInput keep their own text, so a different rule needs a fresh form.
            key={`${ruleMarketplace.id}:${dialog.ruleId ?? "new"}`}
            marketplace={ruleMarketplace}
            rule={ruleBeingEdited}
            defaultAvailable={
              !feeRules.some(
                (rule) => rule.marketplaceId === ruleMarketplace.id && rule.categoryId === null && rule.id !== dialog.ruleId,
              )
            }
            categories={categories}
            onDone={close}
          />
        ) : null}
      </Dialog>
    </>
  );
}

/** The default rule first, then category rules by their full path. */
function sortRules(rules: readonly FeeRuleRecord[], byId: ReadonlyMap<string, CategoryRecord>): FeeRuleRecord[] {
  const label = (rule: FeeRuleRecord) => (rule.categoryId === null ? "" : categoryPath(rule.categoryId, byId));
  return [...rules].sort((a, b) => {
    if (a.categoryId === null) return -1;
    if (b.categoryId === null) return 1;
    return label(a).localeCompare(label(b), "en", { sensitivity: "base" });
  });
}

function MarketplaceNameForm({ marketplace, onDone }: { marketplace: MarketplaceRecord | null; onDone: () => void }) {
  const form = useActionForm(marketplace ? renameMarketplaceAction : createMarketplaceAction, onDone);
  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4 pb-2">
      {marketplace ? <input type="hidden" name="id" value={marketplace.id} /> : null}
      <FormError message={form.formError} />
      <Field
        label="Name"
        error={form.fieldErrors.name}
        hint={marketplace ? "Listings and past sales show the new name." : "You can enter its fees after adding it."}
      >
        <Input
          name="name"
          required
          maxLength={NAME_MAX_LENGTH}
          autoComplete="off"
          defaultValue={marketplace?.name ?? ""}
          autoFocus={marketplace === null}
        />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={form.pending}>
          {form.pending ? "Saving…" : marketplace ? "Save" : "Add marketplace"}
        </Button>
      </div>
    </form>
  );
}

function FeeRuleForm({
  marketplace,
  rule,
  defaultAvailable,
  categories,
  onDone,
}: {
  marketplace: MarketplaceRecord;
  rule: FeeRuleRecord | null;
  /** False if another rule is already this marketplace's default. Then this rule must name a category. */
  defaultAvailable: boolean;
  categories: readonly CategoryRecord[];
  onDone: () => void;
}) {
  const form = useActionForm(saveFeeRuleAction, onDone);
  const remove = useActionForm(deleteFeeRuleAction, onDone);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  // The inputs report null for an empty field. An empty field saves as 0, so the preview counts null as 0.
  const [percentBps, setPercentBps] = useState<number | null>(rule?.percentBps ?? 0);
  const [fixedCents, setFixedCents] = useState<number | null>(rule?.fixedCents ?? 0);
  const [paymentPercentBps, setPaymentPercentBps] = useState<number | null>(rule?.paymentPercentBps ?? 0);
  const [paymentFixedCents, setPaymentFixedCents] = useState<number | null>(rule?.paymentFixedCents ?? 0);
  const [appliesToShipping, setAppliesToShipping] = useState(rule?.appliesToShipping ?? true);
  const busy = form.pending || remove.pending;

  const sampleFee = sampleFeeCents(
    {
      percentBps: percentBps ?? 0,
      fixedCents: fixedCents ?? 0,
      paymentPercentBps: paymentPercentBps ?? 0,
      paymentFixedCents: paymentFixedCents ?? 0,
      appliesToShipping,
    },
    SAMPLE_PRICE_CENTS,
    SAMPLE_SHIPPING_CENTS,
  );

  return (
    <div className="flex flex-col gap-5 pb-2">
      <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={rule?.id ?? ""} />
        <input type="hidden" name="marketplaceId" value={marketplace.id} />
        <FormError message={form.formError} />

        <Field
          label="Applies to"
          error={form.fieldErrors.categoryId}
          hint="A category rule also covers its subcategories, unless one of them has its own rule."
        >
          <CategoryPicker
            name="categoryId"
            categories={categories}
            defaultValue={rule?.categoryId ?? ""}
            required={!defaultAvailable}
            emptyLabel={defaultAvailable ? `Default (every category on ${marketplace.name})` : "Choose a category"}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Marketplace fee" error={form.fieldErrors.percent} hint="Percent of the sale">
            <PercentInput
              name="percent"
              defaultValueBps={rule?.percentBps}
              placeholder="0"
              onValueChange={(bps) => setPercentBps(bps)}
            />
          </Field>
          <Field label="Fixed fee" error={form.fieldErrors.fixed} hint="Per order">
            <MoneyInput
              name="fixed"
              defaultValueCents={rule?.fixedCents}
              placeholder="0.00"
              onValueChange={(cents) => setFixedCents(cents)}
            />
          </Field>
        </div>

        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            name="appliesToShipping"
            value="on"
            checked={appliesToShipping}
            onChange={(event) => setAppliesToShipping(event.target.checked)}
            className="size-5 shrink-0 cursor-pointer accent-primary"
          />
          <span>
            <span className="font-medium">Percent applies to shipping too</span>
            <span className="block text-[13px] text-ink-muted">
              On: the percent is charged on item price plus the shipping the buyer pays. Off: on item price only.
            </span>
          </span>
        </label>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1.5 font-medium">
            Payment processing <span className="font-normal text-ink-muted">(only if billed separately)</span>
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment percent" error={form.fieldErrors.paymentPercent}>
              <PercentInput
                name="paymentPercent"
                defaultValueBps={rule?.paymentPercentBps}
                placeholder="0"
                onValueChange={(bps) => setPaymentPercentBps(bps)}
              />
            </Field>
            <Field label="Payment fixed fee" error={form.fieldErrors.paymentFixed}>
              <MoneyInput
                name="paymentFixed"
                defaultValueCents={rule?.paymentFixedCents}
                placeholder="0.00"
                onValueChange={(cents) => setPaymentFixedCents(cents)}
              />
            </Field>
          </div>
        </fieldset>

        <p aria-live="polite" className="rounded-control bg-mint px-4 py-3 text-ink-secondary">
          <span className="font-semibold text-ink">Try it: </span>
          {sampleFee === null ? (
            "the two percentages together must be under 100%."
          ) : (
            <>
              a {formatCents(SAMPLE_PRICE_CENTS)} sale with {formatCents(SAMPLE_SHIPPING_CENTS)} shipping would be charged{" "}
              <strong className="font-semibold tabular-nums text-ink">{formatCents(sampleFee)}</strong>.
            </>
          )}
        </p>

        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {form.pending ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </form>

      {rule ? (
        <div className="flex flex-col gap-2.5 border-t border-border pt-4">
          <FormError message={remove.formError} />
          <p className="text-ink-muted">Deleting a rule does not change sales already recorded. They keep the fee they were saved with.</p>
          <div className="flex flex-wrap gap-2">
            {confirmingDelete ? (
              <>
                <Button variant="danger" disabled={busy} onClick={() => remove.submit({ id: rule.id })}>
                  {remove.pending ? "Deleting…" : "Yes, delete this rule"}
                </Button>
                <Button disabled={busy} onClick={() => setConfirmingDelete(false)}>
                  Keep it
                </Button>
              </>
            ) : (
              <Button variant="danger" disabled={busy} onClick={() => setConfirmingDelete(true)}>
                Delete rule
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
