import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

/**
 * PLACEHOLDER from the foundation. The lookup feature replaces this and may add more handlers under /api/lookup.
 * API keys stay on the server: read them with rapidApiEnv() from "@/lib/env".
 */
export async function GET(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ error: "Price lookup is not built yet" }, { status: 501 });
}
