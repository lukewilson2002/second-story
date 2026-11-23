import { expect, test } from "@playwright/test";
import { logIn, ownerCredentials } from "./helpers";

// These tests are about signing in, so they start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("a signed-out visitor is sent to the login page", async ({ page }) => {
  await page.goto("/inventory");
  await expect(page).toHaveURL(/\/login\?next=%2Finventory$/);
  await expect(page.getByRole("heading", { name: "Log in" })).toBeVisible();
});

test("a signed-out API call gets a 401, not a redirect", async ({ request }) => {
  const response = await request.get("/api/lookup", { maxRedirects: 0 });
  expect(response.status()).toBe(401);
});

test("a wrong password is rejected", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(ownerCredentials().email);
  await page.getByLabel("Password").fill("not-the-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That email or password is not right." })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("the owner can log in, land on the page they asked for, and log out", async ({ page, isMobile }) => {
  const { email, password } = ownerCredentials();
  await page.goto("/sales");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).toHaveURL(/\/sales$/);

  const nav = page.getByRole("navigation", { name: isMobile ? "Sections" : "Main" });
  await expect(nav.getByRole("link", { name: "Sales" })).toHaveAttribute("aria-current", "page");

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("logging in from the login page goes to the dashboard", async ({ page }) => {
  await logIn(page);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("main#main")).toBeVisible();
});
