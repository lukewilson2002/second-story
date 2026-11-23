import { NextResponse } from "next/server";
import { createUploadSignature } from "@/features/inventory/cloudinary-server";
import { getUserId } from "@/lib/auth";
import { hasCloudinaryEnv } from "@/lib/env";

/**
 * Signs one direct browser upload to Cloudinary.
 * The request has no body: the server picks the public id and the timestamp, so a caller cannot get anything else signed.
 * The response holds the cloud name, API key, timestamp, public id and signature. The API secret never leaves the server.
 * If the Cloudinary variables are missing it answers 503 with `code: "not_configured"`.
 */
export async function POST(): Promise<NextResponse> {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  if (!hasCloudinaryEnv()) {
    return NextResponse.json({ error: "Photo uploads are not set up", code: "not_configured" }, { status: 503 });
  }
  return NextResponse.json(createUploadSignature(userId), { headers: { "Cache-Control": "no-store" } });
}
