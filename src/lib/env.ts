import "server-only";
import { z } from "zod";

/**
 * Server environment variables, validated the first time they are asked for.
 * Nothing is read at import time, so `next build` works without secrets.
 * Never log the returned values and never pass them to a Client Component.
 */

function read<T>(name: string, schema: z.ZodType<T>, values: Record<string, string | undefined>): T {
  const result = schema.safeParse(values);
  if (!result.success) {
    const missing = result.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`${name} environment variables are missing or invalid: ${missing}. See .env.example.`);
  }
  return result.data;
}

const authSchema = z.object({
  OWNER_EMAIL: z.string().trim().toLowerCase().pipe(z.email()),
  OWNER_PASSWORD_HASH: z.string().startsWith("scrypt:"),
  SESSION_SECRET: z.string().min(32),
});

/** Owner login settings. Throws if any are missing. */
export function authEnv(): z.infer<typeof authSchema> {
  return read("Auth", authSchema, {
    OWNER_EMAIL: process.env.OWNER_EMAIL,
    OWNER_PASSWORD_HASH: process.env.OWNER_PASSWORD_HASH,
    SESSION_SECRET: process.env.SESSION_SECRET,
  });
}

const cloudinarySchema = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
});

/** Cloudinary credentials for signing uploads. Throws if any are missing. */
export function cloudinaryEnv(): z.infer<typeof cloudinarySchema> {
  return read("Cloudinary", cloudinarySchema, {
    CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
    CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
    CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  });
}

/** True if all three Cloudinary variables are set. Use it to show "photos are not set up" instead of failing. */
export function hasCloudinaryEnv(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET,
  );
}

const rapidApiSchema = z.object({ RAPIDAPI_KEY: z.string().min(1) });

/** RapidAPI key for the eBay sold-listings source. Throws if it is missing. */
export function rapidApiEnv(): z.infer<typeof rapidApiSchema> {
  return read("RapidAPI", rapidApiSchema, { RAPIDAPI_KEY: process.env.RAPIDAPI_KEY });
}

/** True if RAPIDAPI_KEY is set. */
export function hasRapidApiEnv(): boolean {
  return Boolean(process.env.RAPIDAPI_KEY);
}
