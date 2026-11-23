import "server-only";

export interface CloudinaryImageOptions {
  /** Width in CSS pixels. The URL asks for twice this, for sharp screens. */
  width: number;
  height: number;
}

/**
 * Builds a Cloudinary delivery URL for a stored `cloudinary_public_id`, cropped to fill the given size.
 * Returns null if CLOUDINARY_CLOUD_NAME is not set, so callers fall back to the pastel thumbnail.
 * Server only. Build the URL in a Server Component and pass the string down.
 */
export function cloudinaryImageUrl(publicId: string, options: CloudinaryImageOptions): string | null {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  if (!cloudName) return null;
  const transform = `c_fill,w_${options.width * 2},h_${options.height * 2},q_auto,f_auto`;
  const path = publicId.split("/").map(encodeURIComponent).join("/");
  return `https://res.cloudinary.com/${encodeURIComponent(cloudName)}/image/upload/${transform}/${path}`;
}
