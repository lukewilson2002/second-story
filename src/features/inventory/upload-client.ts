import { z } from "zod";

/**
 * Browser side of a signed direct upload: ask our server for a signature, then post the file straight to Cloudinary.
 * The file never passes through our server and the API secret never reaches the browser.
 */

export interface UploadedPhoto {
  publicId: string;
  width: number;
  height: number;
  /** A small square preview straight from Cloudinary, for showing the photo before the page reloads. */
  previewUrl: string;
}

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const signatureSchema = z.object({
  cloudName: z.string().min(1),
  apiKey: z.string().min(1),
  timestamp: z.number(),
  publicId: z.string().min(1),
  signature: z.string().min(1),
});

const uploadResultSchema = z.object({
  public_id: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  secure_url: z.url(),
});

/** An upload problem with a message written for the person using the app. */
export class UploadError extends Error {}

/** Uploads one image. Throws `UploadError` with a message to show if anything goes wrong. */
export async function uploadPhoto(file: File): Promise<UploadedPhoto> {
  if (!file.type.startsWith("image/")) throw new UploadError(`"${file.name}" is not an image.`);
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError(`"${file.name}" is larger than 10 MB.`);

  let signResponse: Response;
  try {
    signResponse = await fetch("/api/cloudinary/sign", { method: "POST" });
  } catch {
    throw new UploadError("Could not reach the server. Check your connection and try again.");
  }
  if (signResponse.status === 503) throw new UploadError("Photo uploads are not set up.");
  if (signResponse.status === 401) throw new UploadError("You are signed out. Log in again to upload photos.");
  const signed = signatureSchema.safeParse(await signResponse.json().catch(() => null));
  if (!signResponse.ok || !signed.success) throw new UploadError("The upload could not be started. Try again.");

  const body = new FormData();
  body.set("file", file);
  body.set("api_key", signed.data.apiKey);
  body.set("timestamp", String(signed.data.timestamp));
  body.set("public_id", signed.data.publicId);
  body.set("signature", signed.data.signature);

  let uploadResponse: Response;
  try {
    uploadResponse = await fetch(
      `https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.data.cloudName)}/image/upload`,
      { method: "POST", body },
    );
  } catch {
    throw new UploadError(`"${file.name}" could not be uploaded. Check your connection and try again.`);
  }
  if (uploadResponse.status === 401) {
    throw new UploadError("Cloudinary refused the upload. Check that CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are the real values.");
  }
  const uploaded = uploadResultSchema.safeParse(await uploadResponse.json().catch(() => null));
  // The signature covers the public id, so Cloudinary only accepts the one the server chose.
  if (!uploadResponse.ok || !uploaded.success || uploaded.data.public_id !== signed.data.publicId) {
    throw new UploadError(`Cloudinary did not accept "${file.name}".`);
  }

  return {
    publicId: uploaded.data.public_id,
    width: uploaded.data.width,
    height: uploaded.data.height,
    previewUrl: uploaded.data.secure_url.replace("/upload/", "/upload/c_fill,w_240,h_240,q_auto,f_auto/"),
  };
}
