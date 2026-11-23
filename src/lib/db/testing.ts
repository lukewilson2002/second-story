import { Kysely } from "kysely";
import { MEMORY_DATA_DIR, openLocalDatabase } from "./local";
import { PGliteDialect } from "./pglite-dialect";
import { seedBase } from "./seed";
import type { DB } from "./types";

export interface TestDb {
  db: Kysely<DB>;
  /** The id of a seeded user with the starter categories and marketplaces. */
  userId: string;
  /** Call this in `afterAll` or `afterEach`. */
  close: () => Promise<void>;
}

/**
 * Creates a fresh in-memory database with the real migrations and the base seed applied.
 * Each call is isolated, so tests can run in parallel. It takes about a second, so prefer one per test file.
 * For vitest only. Do not import it from app code.
 */
export async function createTestDb(email = "test@second-story.test"): Promise<TestDb> {
  const client = await openLocalDatabase(MEMORY_DATA_DIR);
  const db = new Kysely<DB>({ dialect: new PGliteDialect(async () => client) });
  const userId = await seedBase(db, email);
  return {
    db,
    userId,
    close: async () => {
      await db.destroy();
      await client.close();
    },
  };
}
