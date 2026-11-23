import { NextResponse, type NextRequest } from "next/server";
import { getUserId } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { cleanQuery, MAX_QUERY_LENGTH } from "@/features/lookup/query";
import { lookupPrices } from "@/features/lookup/service";
import { PRICE_SOURCES } from "@/features/lookup/sources";
import type { LookupResponse } from "@/features/lookup/types";

/**
 * GET /api/lookup?q=<text or barcode>&source=<id>
 *
 * Searches the price sources on the server, so API keys never reach the browser.
 * `source` may be repeated. Without it every source is searched.
 * The answer is always 200 with one entry per source, each with its own status, so one failing source does not hide the other.
 * Answers are cached per source and query for 24 hours.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const query = cleanQuery(request.nextUrl.searchParams.get("q"));
  if (!query) {
    return NextResponse.json(
      { error: `Enter something to search for, up to ${MAX_QUERY_LENGTH} characters.` },
      { status: 400 },
    );
  }

  const requested = request.nextUrl.searchParams.getAll("source");
  const known = new Set(PRICE_SOURCES.map((source) => source.id));
  const unknown = requested.find((id) => !known.has(id));
  if (unknown !== undefined) {
    return NextResponse.json({ error: "Unknown price source." }, { status: 400 });
  }

  const sources = await lookupPrices(getDb(), userId, PRICE_SOURCES, query, requested.length > 0 ? { only: requested } : {});
  const body: LookupResponse = { query, sources };
  return NextResponse.json(body, { headers: { "Cache-Control": "private, no-store" } });
}
