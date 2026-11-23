import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain/categories";
import { CategoriesManager } from "@/features/settings/components/CategoriesManager";
import { loadCategoryItemCounts } from "@/features/settings/data";

export const metadata: Metadata = { title: "Categories" };

export default async function Page() {
  const userId = await requireUser();
  const db = getDb();
  const [categories, itemCounts] = await Promise.all([loadCategories(db, userId), loadCategoryItemCounts(db, userId)]);
  return <CategoriesManager categories={categories} itemCounts={Object.fromEntries(itemCounts)} />;
}
