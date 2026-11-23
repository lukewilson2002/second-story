import { NO_FEES, type FeeTerms } from "@/lib/calc";
import type { DbOrTrx } from "@/lib/db";
import { categoryAncestorIds, type CategoryRecord } from "./categories";

/** A fee rule row as the app passes it around. Safe to send to Client Components. */
export interface FeeRuleRecord extends FeeTerms {
  id: string;
  marketplaceId: string;
  /** Null is the marketplace default. */
  categoryId: string | null;
}

/** Loads every fee rule for a user. */
export async function loadFeeRules(db: DbOrTrx, userId: string): Promise<FeeRuleRecord[]> {
  const rows = await db
    .selectFrom("fee_rule")
    .select([
      "id",
      "marketplace_id",
      "category_id",
      "percent_bps",
      "applies_to_shipping",
      "fixed_cents",
      "payment_percent_bps",
      "payment_fixed_cents",
    ])
    .where("user_id", "=", userId)
    .execute();
  return rows.map((row) => ({
    id: row.id,
    marketplaceId: row.marketplace_id,
    categoryId: row.category_id,
    percentBps: row.percent_bps,
    appliesToShipping: row.applies_to_shipping,
    fixedCents: row.fixed_cents,
    paymentPercentBps: row.payment_percent_bps,
    paymentFixedCents: row.payment_fixed_cents,
  }));
}

/**
 * Picks the fee rule for a marketplace and category.
 * It walks up the category tree from the category itself and takes the first rule it finds.
 * If no category on the way up has a rule, the marketplace default (the rule with no category) applies.
 * Returns null if the marketplace has no matching rule at all.
 */
export function resolveFeeRule(
  rules: readonly FeeRuleRecord[],
  marketplaceId: string,
  categoryId: string | null,
  categories: ReadonlyMap<string, Pick<CategoryRecord, "id" | "parentId">>,
): FeeRuleRecord | null {
  const forMarketplace = rules.filter((rule) => rule.marketplaceId === marketplaceId);
  if (categoryId !== null) {
    for (const id of categoryAncestorIds(categoryId, categories)) {
      const match = forMarketplace.find((rule) => rule.categoryId === id);
      if (match) return match;
    }
  }
  return forMarketplace.find((rule) => rule.categoryId === null) ?? null;
}

/** Like `resolveFeeRule`, but returns a rule that charges nothing when none is set. The app ships with no built-in rates. */
export function resolveFeeTerms(
  rules: readonly FeeRuleRecord[],
  marketplaceId: string,
  categoryId: string | null,
  categories: ReadonlyMap<string, Pick<CategoryRecord, "id" | "parentId">>,
): FeeTerms {
  return resolveFeeRule(rules, marketplaceId, categoryId, categories) ?? NO_FEES;
}
