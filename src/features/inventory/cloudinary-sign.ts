import { createHash, randomUUID } from "node:crypto";

/**
 * Cloudinary upload signing, with no dependency on the environment or on Next.js.
 * The secret is passed in, so unit tests and scripts can use these functions too.
 */

/**
 * Signs upload parameters the way Cloudinary expects.
 * The parameters are sorted by name and joined as "a=1&b=2". The API secret is appended and the result is hashed with SHA-1.
 * `file`, `api_key`, `cloud_name` and `resource_type` are never part of the signature, so do not pass them.
 */
export function signCloudinaryParams(params: Readonly<Record<string, string | number>>, apiSecret: string): string {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return createHash("sha1")
    .update(toSign + apiSecret)
    .digest("hex");
}

/** The Cloudinary folder that holds one user's item photos. */
export function photoFolder(userId: string): string {
  return `second-story/${userId}`;
}

/**
 * True if a public id sits in the user's own photo folder.
 * The browser reports the public id after an upload, so it is checked before it is saved or deleted.
 */
export function isOwnPublicId(publicId: string, userId: string): boolean {
  const prefix = `${photoFolder(userId)}/`;
  const rest = publicId.slice(prefix.length);
  return publicId.startsWith(prefix) && /^[A-Za-z0-9_-]+$/.test(rest);
}

export interface UploadSignature {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  /** The full public id the file must be uploaded under. */
  publicId: string;
  signature: string;
}

/**
 * Builds everything the browser needs to post one file straight to Cloudinary.
 * The server picks the public id and the timestamp. Nothing the browser sends is signed.
 * The whole public id is chosen here, not just a folder, because how Cloudinary turns a folder into a public id
 * depends on the account's folder mode. This way the id that comes back is always one `isOwnPublicId` accepts.
 */
export function buildUploadSignature(
  credentials: { cloudName: string; apiKey: string; apiSecret: string },
  userId: string,
  now: Date = new Date(),
  assetId: string = randomUUID(),
): UploadSignature {
  const timestamp = Math.floor(now.getTime() / 1000);
  const publicId = `${photoFolder(userId)}/${assetId}`;
  return {
    cloudName: credentials.cloudName,
    apiKey: credentials.apiKey,
    timestamp,
    publicId,
    signature: signCloudinaryParams({ public_id: publicId, timestamp }, credentials.apiSecret),
  };
}
