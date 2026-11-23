"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { seedBase } from "@/lib/db/seed";
import { authEnv } from "@/lib/env";
import { endSession, startSession } from "./index";
import { verifyPassword } from "./password";
import { safeNextPath } from "./redirect";

export interface LoginState {
  error: string | null;
  email: string;
}

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
  next: z.string().optional(),
});

/**
 * Compares two strings without stopping at the first difference.
 * Both are hashed first, so the comparison takes the same time whatever their lengths.
 */
function sameText(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Checks the email and password against OWNER_EMAIL and OWNER_PASSWORD_HASH, then starts a session.
 * On first login it also creates the owner's user row, categories and marketplaces.
 */
export async function login(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    next: formData.get("next") ?? undefined,
  });
  if (!parsed.success) {
    return { error: "Enter your email and password.", email: String(formData.get("email") ?? "") };
  }
  const env = authEnv();
  // The password is always checked, so a wrong email takes as long as a wrong password.
  const passwordMatches = await verifyPassword(parsed.data.password, env.OWNER_PASSWORD_HASH);
  const emailMatches = sameText(parsed.data.email, env.OWNER_EMAIL);
  if (!passwordMatches || !emailMatches) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return { error: "That email or password is not right.", email: parsed.data.email };
  }
  const userId = await seedBase(getDb(), env.OWNER_EMAIL);
  await startSession(userId);
  redirect(safeNextPath(parsed.data.next));
}

/** Ends the session and returns to the login page. */
export async function logout(): Promise<void> {
  await endSession();
  redirect("/login");
}
