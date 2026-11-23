import { SignJWT, jwtVerify } from "jose";

/**
 * Session tokens: a signed JWT kept in an httpOnly cookie.
 * This file has no Node-only or database imports, so the proxy can use it.
 */

export const SESSION_COOKIE = "ss_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

const ISSUER = "second-story";

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to at least 32 characters. See .env.example.");
  }
  return new TextEncoder().encode(secret);
}

/** Signs a session token for a user id. It expires after 30 days. */
export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the user id from a session token. Returns null if the token is missing, expired, or not signed by this app. */
export async function verifySessionToken(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { issuer: ISSUER, algorithms: ["HS256"] });
    return typeof payload.sub === "string" && payload.sub.length > 0 ? payload.sub : null;
  } catch {
    return null;
  }
}
