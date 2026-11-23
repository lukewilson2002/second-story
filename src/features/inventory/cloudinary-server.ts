import "server-only";
import { cloudinaryEnv, hasCloudinaryEnv } from "@/lib/env";
import { buildUploadSignature, signCloudinaryParams, type UploadSignature } from "./cloudinary-sign";

/** Signs one direct upload for a user. Throws if the Cloudinary variables are missing, so check `hasCloudinaryEnv()` first. */
export function createUploadSignature(userId: string): UploadSignature {
  const env = cloudinaryEnv();
  return buildUploadSignature(
    { cloudName: env.CLOUDINARY_CLOUD_NAME, apiKey: env.CLOUDINARY_API_KEY, apiSecret: env.CLOUDINARY_API_SECRET },
    userId,
  );
}

/**
 * Deletes an image from Cloudinary after its row is gone.
 * It never throws. If Cloudinary is not set up or the call fails, it returns false and the file is left behind,
 * which costs storage but breaks nothing.
 */
export async function destroyCloudinaryImage(publicId: string): Promise<boolean> {
  if (!hasCloudinaryEnv()) return false;
  try {
    const env = cloudinaryEnv();
    const timestamp = Math.floor(Date.now() / 1000);
    const body = new URLSearchParams({
      public_id: publicId,
      timestamp: String(timestamp),
      api_key: env.CLOUDINARY_API_KEY,
      signature: signCloudinaryParams({ public_id: publicId, timestamp }, env.CLOUDINARY_API_SECRET),
    });
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME)}/image/destroy`,
      { method: "POST", body, signal: AbortSignal.timeout(10_000) },
    );
    if (!response.ok) return false;
    const result: unknown = await response.json();
    return typeof result === "object" && result !== null && "result" in result && result.result === "ok";
  } catch {
    return false;
  }
}
