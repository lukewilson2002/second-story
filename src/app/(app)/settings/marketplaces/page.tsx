import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain/categories";
import { loadFeeRules } from "@/lib/domain/fees";
import { MarketplacesManager } from "@/features/settings/components/MarketplacesManager";
import { loadMarketplaces } from "@/features/settings/data";

export const metadata: Metadata = { title: "Marketplaces and fee rules" };

export default async function Page() {
  const userId = await requireUser();
  const db = getDb();
  const [marketplaces, feeRules, categories] = await Promise.all([
    loadMarketplaces(db, userId),
    loadFeeRules(db, userId),
    loadCategories(db, userId),
  ]);
  return <MarketplacesManager marketplaces={marketplaces} feeRules={feeRules} categories={categories} />;
}
