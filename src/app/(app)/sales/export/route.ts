import { NextResponse } from "next/server";
import { salesCsv } from "@/features/sales/csv";
import { loadSaleRows } from "@/features/sales/data";
import { getUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { todayIsoDate } from "@/lib/format";

/** Downloads every sale as a CSV file. */
export async function GET(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const rows = await loadSaleRows(getDb(), userId);
  // The byte order mark makes Excel read the file as UTF-8.
  return new NextResponse(`﻿${salesCsv(rows)}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="second-story-sales-${todayIsoDate()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
