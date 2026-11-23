"use client";

import { useMemo, useState } from "react";
import { Card, CardTitle, CategoryPicker, Field, MoneyInput, Select } from "@/components/ui";
import { categoryPath, type CategoryRecord } from "@/lib/domain/categories";
import { resolveFeeRule, type FeeRuleRecord } from "@/lib/domain/fees";
import { formatCents } from "@/lib/format";
import type { MarketplaceRecord } from "../data";
import { describeFeeTerms, sampleFeeCents } from "../fee-format";

export interface FeePreviewProps {
  /** The marketplaces to offer. Pass at least one. */
  marketplaces: readonly MarketplaceRecord[];
  feeRules: readonly FeeRuleRecord[];
  categories: readonly CategoryRecord[];
}

/**
 * "Try it": pick a marketplace, a category and a price, and see which saved rule applies and what it charges.
 * It uses the same rule lookup and fee formula as listings and sales.
 */
export function FeePreview({ marketplaces, feeRules, categories }: FeePreviewProps) {
  const [marketplaceId, setMarketplaceId] = useState(marketplaces[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [priceCents, setPriceCents] = useState<number | null>(2000);
  const [shippingCents, setShippingCents] = useState<number | null>(500);
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);

  // If the picked marketplace was archived or renamed away, fall back to the first one.
  const marketplace = marketplaces.find((entry) => entry.id === marketplaceId) ?? marketplaces[0];
  if (!marketplace) return null;

  const rule = resolveFeeRule(feeRules, marketplace.id, categoryId === "" ? null : categoryId, byId);
  const fee = rule ? sampleFeeCents(rule, priceCents, shippingCents ?? 0) : 0;
  const ruleName =
    rule === null
      ? null
      : rule.categoryId === null
        ? `the ${marketplace.name} default rule`
        : `the ${marketplace.name} rule for ${categoryPath(rule.categoryId, byId)}`;

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <CardTitle>Try it</CardTitle>
        <p className="mt-1 text-ink-muted">See which rule a sale would use and what it would be charged.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Field label="Marketplace" className="col-span-2 lg:col-span-1">
          <Select value={marketplace.id} onChange={(event) => setMarketplaceId(event.target.value)}>
            {marketplaces.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Category" className="col-span-2 lg:col-span-1">
          <CategoryPicker categories={categories} value={categoryId} onValueChange={setCategoryId} emptyLabel="Any category" />
        </Field>
        <Field label="Item price">
          <MoneyInput defaultValueCents={2000} onValueChange={setPriceCents} />
        </Field>
        <Field label="Shipping charged">
          <MoneyInput defaultValueCents={500} onValueChange={setShippingCents} />
        </Field>
      </div>
      <div aria-live="polite" className="rounded-control bg-mint px-4 py-3">
        {priceCents === null || fee === null ? (
          <p className="text-ink-secondary">Enter an item price to see the fee.</p>
        ) : (
          <>
            <p className="text-eyebrow">Fee</p>
            <p className="font-display text-[26px] leading-tight font-bold tabular-nums">{formatCents(fee)}</p>
            <p className="mt-0.5 text-ink-secondary">
              {rule && ruleName
                ? `Uses ${ruleName}: ${describeFeeTerms(rule)}.`
                : `${marketplace.name} has no rule that covers this category, so no fees are charged.`}
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
