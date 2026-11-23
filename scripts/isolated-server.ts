import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { loadEnvConfig } from "@next/env";

/**
 * Runs the app on its own port with its own database and its own build folder, so it never collides with
 * `pnpm dev` or with another agent working in the same checkout.
 *
 *   tsx scripts/isolated-server.ts e2e   Playwright's server. Fresh database with the demo seed, then a production
 *                                        build served by `next start`. Uses .env.test. Port from E2E_PORT (default 3100).
 *                                        Set E2E_DEV=1 to serve with `next dev` instead, which starts faster.
 *                                        Set E2E_REAL_SERVICES=1 to keep the real Cloudinary and RapidAPI keys from .env.local
 *                                        and a database that is kept between runs (`.pglite/e2e-live-<port>`).
 *   tsx scripts/isolated-server.ts dev   A second dev server. Uses .env.development and .env.local. Port from PORT (required).
 *                                        The database is seeded with demo data the first time and kept afterwards.
 *
 * Everything it creates is named after the port and is gitignored:
 * `.pglite/<mode>-<port>`, `.next-<mode>-<port>` and `.next-<mode>-<port>.tsconfig.json`.
 */
const mode = process.argv[2];
if (mode !== "e2e" && mode !== "dev") {
  console.error("Usage: tsx scripts/isolated-server.ts <e2e|dev>");
  process.exit(1);
}
const port = mode === "e2e" ? process.env.E2E_PORT || "3100" : process.env.PORT;
if (!port || !/^\d+$/.test(port)) {
  console.error("Set PORT to a free port number, for example PORT=3201.");
  process.exit(1);
}

const root = process.cwd();
const realServices = mode === "e2e" && Boolean(process.env.E2E_REAL_SERVICES);
const name = realServices ? `e2e-live-${port}` : `${mode}-${port}`;
const dataDir = path.join(root, ".pglite", name);
const distDir = `.next-${name}`;
const tsconfigPath = `${distDir}.tsconfig.json`;

// In e2e mode this reads .env.test and skips .env.local, so tests never see the real Cloudinary and RapidAPI keys.
const nodeEnv = mode === "e2e" ? "test" : "development";
Object.assign(process.env, { NODE_ENV: nodeEnv });
loadEnvConfig(root, mode === "dev", { info: () => undefined, error: console.error });

const env: Record<string, string | undefined> = {
  ...process.env,
  PORT: port,
  PGLITE_DATA_DIR: dataDir,
  NEXT_DIST_DIR: distDir,
  NEXT_TSCONFIG_PATH: tsconfigPath,
  DATABASE_URL: "",
};
if (mode === "e2e") {
  // Blank values set here win over anything `next start` loads, so a default e2e run cannot spend the owner's API quota.
  // With E2E_REAL_SERVICES the real values are read from .env.local here and passed on.
  // `next start` does not load that file itself in this setup, because the env files were already loaded once above.
  const localPath = path.join(root, ".env.local");
  const local = realServices && existsSync(localPath) ? parseEnv(readFileSync(localPath, "utf8")) : {};
  for (const key of ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET", "RAPIDAPI_KEY"]) {
    env[key] = local[key] ?? "";
  }
}

function run(args: string[], runEnv: string): void {
  const result = spawnSync("pnpm", ["exec", ...args], {
    cwd: root,
    env: { ...env, NODE_ENV: runEnv } as NodeJS.ProcessEnv,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

writeFileSync(path.join(root, tsconfigPath), `${JSON.stringify({ extends: "./tsconfig.json" }, null, 2)}\n`);

// Seeding finishes before the server starts, because PGlite allows one process per data directory.
// The live-services database is kept between runs. Its 24-hour lookup cache then answers a repeat run,
// so only the first run of a day spends an eBay request.
if ((mode === "e2e" && !realServices) || !existsSync(dataDir)) {
  run(["tsx", "scripts/db.ts", "reset"], nodeEnv);
  run(["tsx", "scripts/db.ts", "seed:demo"], nodeEnv);
}

const serveWithDev = mode === "dev" || process.env.E2E_DEV === "1";
if (!serveWithDev) run(["next", "build"], "production");

const server = spawn("pnpm", ["exec", "next", serveWithDev ? "dev" : "start", "-p", port], {
  cwd: root,
  env: { ...env, NODE_ENV: serveWithDev ? "development" : "production" } as NodeJS.ProcessEnv,
  stdio: "inherit",
});
const stop = () => server.kill("SIGTERM");
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => process.exit(code ?? 0));
