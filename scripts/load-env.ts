import { loadEnvConfig } from "@next/env";

/**
 * Loads the same .env files Next.js would, so scripts see the same variables as the app.
 * With NODE_ENV=test this reads .env.test and skips .env.local. Otherwise it reads .env.development and .env.local.
 */
export function loadEnv(): void {
  const dev = process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";
  loadEnvConfig(process.cwd(), dev, { info: () => undefined, error: console.error });
}
