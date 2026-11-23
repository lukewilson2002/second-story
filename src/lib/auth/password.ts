import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, length, { N: n, r, p }, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

/**
 * Hashes a password with scrypt.
 * The result looks like `scrypt:16384:8:1:<salt>:<hash>` with base64url parts.
 * It has no "$" on purpose. Next.js expands "$NAME" inside .env files, which would corrupt a bcrypt hash.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P, KEY_LENGTH);
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join(":");
}

/** Checks a password against a stored hash. Returns false if the hash is malformed. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltPart, keyPart] = stored.split(":");
  if (scheme !== "scrypt" || !n || !r || !p || !saltPart || !keyPart) return false;
  const params = [Number(n), Number(r), Number(p)] as const;
  if (params.some((value) => !Number.isInteger(value) || value <= 0)) return false;
  const expected = Buffer.from(keyPart, "base64url");
  if (expected.length === 0) return false;
  try {
    const actual = await derive(password, Buffer.from(saltPart, "base64url"), ...params, expected.length);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
