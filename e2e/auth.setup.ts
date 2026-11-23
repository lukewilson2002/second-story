import { test as setup } from "@playwright/test";
import { STORAGE_STATE } from "../playwright.config";
import { logIn } from "./helpers";

setup("sign in and save the session", async ({ page }) => {
  await logIn(page);
  await page.context().storageState({ path: STORAGE_STATE });
});
