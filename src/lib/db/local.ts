import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { Kysely } from "kysely";
import { migrateToLatest } from "./migrate";
import { PGliteDialect } from "./pglite-dialect";

export const MEMORY_DATA_DIR = "memory://";
export const DEFAULT_DATA_DIR = ".pglite/dev";

/** The local data directory, from PGLITE_DATA_DIR. Relative paths resolve from the project root. */
export function localDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (configured === MEMORY_DATA_DIR) return MEMORY_DATA_DIR;
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), configured || DEFAULT_DATA_DIR);
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/**
 * Takes the lock on a data directory.
 * PGlite is single-process. If a second process opened the same directory, both would corrupt it.
 * If another live process holds the lock, this throws instead.
 */
function lockDataDir(dataDir: string): void {
  const lockFile = `${dataDir}.lock`;
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, "utf8").trim());
    if (Number.isInteger(pid) && pid !== process.pid && processIsAlive(pid)) {
      throw new Error(
        `The local database at ${dataDir} is in use by process ${pid}. ` +
          "Stop that process (for example the dev server) or set PGLITE_DATA_DIR to another directory.",
      );
    }
  }
  mkdirSync(path.dirname(dataDir), { recursive: true });
  writeFileSync(lockFile, String(process.pid));
  process.once("exit", () => {
    try {
      if (readFileSync(lockFile, "utf8").trim() === String(process.pid)) rmSync(lockFile);
    } catch {
      // The lock file is already gone.
    }
  });
}

/**
 * Opens a PGlite database and brings its schema up to date.
 * Pass MEMORY_DATA_DIR for a throwaway in-memory database.
 *
 * The parsers make PGlite return the same JS types as the production driver:
 * `date` columns are "YYYY-MM-DD" strings and `bigint` (count, sum) is a number.
 */
export async function openLocalDatabase(dataDir: string): Promise<PGlite> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  const inMemory = dataDir === MEMORY_DATA_DIR;
  if (!inMemory) lockDataDir(dataDir);
  const client = new PGlite({
    ...(inMemory ? {} : { dataDir }),
    parsers: {
      [types.DATE]: (value: string) => value,
      [types.INT8]: (value: string) => Number(value),
    },
  });
  await client.waitReady;
  const migrationDb = new Kysely<unknown>({ dialect: new PGliteDialect(async () => client) });
  await migrateToLatest(migrationDb);
  await migrationDb.destroy();
  return client;
}

/** Deletes a local data directory and its lock file. */
export function removeLocalDatabase(dataDir: string): void {
  if (dataDir === MEMORY_DATA_DIR) return;
  const lockFile = `${dataDir}.lock`;
  if (existsSync(lockFile)) {
    const pid = Number(readFileSync(lockFile, "utf8").trim());
    if (Number.isInteger(pid) && pid !== process.pid && processIsAlive(pid)) {
      throw new Error(`The local database at ${dataDir} is in use by process ${pid}.`);
    }
  }
  rmSync(dataDir, { recursive: true, force: true });
  rmSync(lockFile, { force: true });
}
