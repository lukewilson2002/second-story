import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken, verifySessionToken } from "./session";

/**
 * Returns the signed-in user's id, or null.
 * The cookie signature is checked, then the user row is looked up.
 * If the user row is gone (for example after a database reset), the session counts as signed out.
 * The result is cached for the request, so calling this many times costs one query.
 */
export const getUserId = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const userId = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!userId) return null;
  const user = await getDb()
    .selectFrom("app_user")
    .select("id")
    .where("id", "=", userId)
    .executeTakeFirst();
  return user?.id ?? null;
});

/**
 * Returns the signed-in user's id for queries. If nobody is signed in, it redirects to /login.
 * Call it at the top of every page, Server Action and data function, and filter every query by the id.
 * In a Route Handler use `getUserId()` and return a 401 instead, because a redirect is the wrong answer for an API.
 */
export async function requireUser(): Promise<string> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return userId;
}

/** Sets the session cookie. Only call this from a Server Action or Route Handler. */
export async function startSession(userId: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, await createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    // Plain http://localhost must keep working for `next start` in e2e runs.
    secure: process.env.VERCEL === "1" || process.env.SESSION_COOKIE_SECURE === "1",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

/** Clears the session cookie. Only call this from a Server Action or Route Handler. */
export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}
