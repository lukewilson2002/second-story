import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { loadCategories } from "@/lib/domain";
import { KitchenSink } from "./KitchenSink";

export const metadata: Metadata = { title: "UI primitives" };

/** Renders every shared primitive on one page, for checking them by eye and in Playwright. Off unless ENABLE_DEV_ROUTES=1. */
export default async function Page() {
  if (process.env.ENABLE_DEV_ROUTES !== "1") notFound();
  const userId = await requireUser();
  const categories = await loadCategories(getDb(), userId);
  return <KitchenSink categories={categories} />;
}
