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

test("a login link cannot send the owner to another site", async ({ page }) => {
  const { email, password } = ownerCredentials();
  // The browser drops the tab from "/%09/host", which would leave "//host": another site.
  for (const next of ["//evil.example/", "/%09/evil.example/", "/%5Cevil.example/", "https://evil.example/"]) {
    await page.context().clearCookies();
    await page.goto(`/login?next=${next}`);
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await expect(page.locator("main#main")).toBeVisible();
    expect(new URL(page.url()).host, `next=${next}`).toBe(new URL(test.info().project.use.baseURL ?? "").host);
    expect(new URL(page.url()).pathname, `next=${next}`).toBe("/");
  }
});

test("the session cookie is hidden from scripts and is not sent from other sites", async ({ page }) => {
  await logIn(page);
  const session = (await page.context().cookies()).find((cookie) => cookie.name === "ss_session");
  expect(session).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
  expect(await page.evaluate(() => document.cookie)).not.toContain("ss_session");
});

test("a forged or tampered session cookie is signed out", async ({ page, baseURL }) => {
  await logIn(page);
  const session = (await page.context().cookies()).find((cookie) => cookie.name === "ss_session");
  const [header = "", payload = "", signature = ""] = (session?.value ?? "").split(".");
  // The same token with another user id in the payload. The signature no longer matches.
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
  const tampered = Buffer.from(JSON.stringify({ ...claims, sub: "00000000-0000-4000-8000-000000000000" })).toString("base64url");
  const unsigned = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  for (const value of [`${header}.${tampered}.${signature}`, `${unsigned}.${payload}.`, "not-a-token"]) {
    await page.context().clearCookies();
    await page.context().addCookies([{ name: "ss_session", value, url: baseURL ?? "" }]);
    await page.goto("/inventory");
    await expect(page).toHaveURL(/\/login\?next=%2Finventory$/);
    const api = await page.request.get("/sales/export", { maxRedirects: 0 });
    expect(api.status()).not.toBe(200);
  }
});

test("every signed-out route refuses to serve data", async ({ request }) => {
  for (const path of ["/", "/inventory", "/listings", "/sales", "/sales/export", "/lookup", "/settings", "/scan"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status(), path).toBe(307);
    expect(response.headers()["location"], path).toContain("/login");
  }
  const sign = await request.post("/api/cloudinary/sign", { maxRedirects: 0 });
  expect(sign.status()).toBe(401);
});

test("pages are served with the headers that stop framing and type sniffing", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.headers()).toMatchObject({
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  });
});
