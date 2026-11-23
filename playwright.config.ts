import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

// Gives the tests the dev-only login from .env.test.
Object.assign(process.env, { NODE_ENV: "test" });
loadEnvConfig(process.cwd(), false, { info: () => undefined, error: console.error });

const port = process.env.E2E_PORT || "3100";
const baseURL = `http://localhost:${port}`;

/** Where the signed-in browser state is saved by e2e/auth.setup.ts. Tests in the desktop and phone projects start signed in. */
export const STORAGE_STATE = `test-results/.auth/owner-${port}.json`;

/**
 * `E2E_REAL_SERVICES=1` starts the server with the real Cloudinary and RapidAPI keys from .env.local and runs only e2e/live.
 * Without it those specs are left out, so a default run is offline and spends no quota.
 */
const live = Boolean(process.env.E2E_REAL_SERVICES);
const signedInProjects = [
  {
    name: "desktop",
    dependencies: ["setup"],
    testIgnore: /e2e\/live\//,
    use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, storageState: STORAGE_STATE },
  },
  {
    name: "phone",
    dependencies: ["setup"],
    testIgnore: /e2e\/live\//,
    // The phone board is 390 × 844. Chromium is used for both projects, so only one browser needs installing.
    use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, storageState: STORAGE_STATE },
  },
];
const liveProject = {
  name: "live",
  dependencies: ["setup"],
  testMatch: /e2e\/live\/.*\.spec\.ts/,
  // No trace: it would record the sign response, which holds the Cloudinary API key.
  use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, storageState: STORAGE_STATE, trace: "off" as const },
};

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/artifacts",
  fullyParallel: false,
  // One worker: every test shares one seeded database, so tests that write must not run at the same time.
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: { baseURL, trace: "retain-on-failure" },
  projects: [{ name: "setup", testMatch: /auth\.setup\.ts/ }, ...(live ? [liveProject] : signedInProjects)],
  webServer: {
    command: "pnpm exec tsx scripts/isolated-server.ts e2e",
    url: `${baseURL}/login`,
    reuseExistingServer: false,
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
