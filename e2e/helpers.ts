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

export interface SmallControl {
  text: string;
  height: number;
}

/** Visible links, buttons and fields inside `main` that are shorter than 44px. Checkboxes and radios are judged by their label, so they are left out. */
export async function findSmallControls(page: Page): Promise<SmallControl[]> {
  return page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      "main a, main button, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), main select, main textarea, main summary",
    );
    return [...controls]
      .filter((element) => element.getClientRects().length > 0 && !element.closest(".visually-hidden"))
      .map((element) => ({
        text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("name") || element.tagName).trim().slice(0, 40),
        height: Math.round(element.getBoundingClientRect().height * 10) / 10,
      }))
      .filter((control) => control.height < 43.5);
  });
}

/** Collects uncaught errors and console errors from the page, so a test can assert there were none. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}
