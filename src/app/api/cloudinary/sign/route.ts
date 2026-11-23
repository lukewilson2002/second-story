import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";

/**
 * PLACEHOLDER from the foundation. The inventory feature replaces this with the handler that signs direct uploads.
 * Read the credentials with cloudinaryEnv() from "@/lib/env". The API secret must never reach the browser.
 */
export async function POST(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  return NextResponse.json({ error: "Photo uploads are not built yet" }, { status: 501 });
}
