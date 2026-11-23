import type { Page } from "@playwright/test";

/** The dev-only login from .env.test. */
export function ownerCredentials(): { email: string; password: string } {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.DEV_OWNER_PASSWORD;
  if (!email || !password) throw new Error("OWNER_EMAIL and DEV_OWNER_PASSWORD must be set in .env.test");
  return { email, password };
}

/** Signs in through the login form. Most tests do not need this, because they start from the saved signed-in state. */
export async function logIn(page: Page): Promise<void> {
  const { email, password } = ownerCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/");
}
