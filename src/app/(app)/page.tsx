import type { Metadata } from "next";
import { Dashboard } from "@/features/dashboard/Dashboard";
import { monthOf, resolveMonth } from "@/features/dashboard/month";
import { loadDashboard, loadEarliestMonth } from "@/features/dashboard/queries";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIsoDate } from "@/lib/format";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const userId = await requireUser();
  const params = await searchParams;
  const requested = typeof params.month === "string" ? params.month : undefined;

  const db = getDb();
  const today = todayIsoDate();
  const currentMonth = monthOf(today);
  const earliestMonth = await loadEarliestMonth(db, userId, currentMonth);
  const month = resolveMonth(requested, currentMonth, earliestMonth);
  const data = await loadDashboard(db, userId, { month, today });

  return <Dashboard data={data} currentMonth={currentMonth} earliestMonth={earliestMonth} />;
}
