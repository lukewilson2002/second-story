import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

/** PLACEHOLDER from the foundation. The listings-sales feature replaces this with the CSV export of sales. */
export async function GET(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ error: "The sales export is not built yet" }, { status: 501 });
}
